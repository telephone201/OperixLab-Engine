import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "../../../lib/db";
import { batchRegistrationService } from "./batch-registration-service";
import { excelSourceAdapter } from "./adapters/excel-source-adapter";
import { csvSourceAdapter } from "./adapters/csv-source-adapter";
import { excelRawMatrixReader } from "./adapters/excel-raw-matrix-reader";
import { processExternalLeadRow } from "./external-lead-pipeline";
import { stageLead } from "./staging-writer";
import { RawSourceSchemaProfiler } from "./raw-source-schema-profiler";
import { buildMappingPreview } from "./mapping-preview-service";
import { mappingReviewSessionService } from "./mapping-review-session-service";
import type { ExternalSourceMetadata } from "./adapters/external-source-reader";

export interface IngestFileInput {
    filePath: string;
    originalFilename: string;
    batchName?: string;
    userId?: string | null;
}

export interface IngestFileResult {
    batch: {
        id: string;
        batchName: string;
        source: string;
        provider: string;
        status: string;
        totalRecords: number;
        processedRecords: number;
        duplicateRecords: number;
        failedRecords: number;
    };
    reviewSession: {
        id: string;
        status: string;
        sourceChecksum: string;
        sectionCount: number;
    };
}

export interface PromoteBatchResult {
    batchId: string;
    importedCount: number;
    skippedCount: number;
}

export class ExternalLeadIngestionOrchestrator {
    /**
     * Orchestrates CSV/XLSX file ingestion:
     * 1. Checksum & batch registration in ingestion_batches
     * 2. Staging raw lead records into raw_lead_staging
     * 3. Building mapping preview and creating mapping_review_sessions
     * 4. Does NOT auto-create leads/companies (preserves human mapping review gate).
     */
    async ingestFile(input: IngestFileInput): Promise<IngestFileResult> {
        if (!fs.existsSync(input.filePath)) {
            throw new Error(`Uploaded file not found at ${input.filePath}`);
        }

        const ext = path.extname(input.originalFilename).toLowerCase();
        const isCsv = ext === ".csv";
        const format = isCsv ? "CSV" : "XLSX";

        const fileBuffer = fs.readFileSync(input.filePath);
        const checksum = crypto
            .createHash("sha256")
            .update(fileBuffer)
            .digest("hex");

        const batchName =
            input.batchName?.trim() ||
            path.basename(input.originalFilename, ext);

        const sourceMetadata: ExternalSourceMetadata = {
            source: isCsv ? "CSV" : "EXCEL",
            provider: "LOCAL_FILE",
            format,
            metadata: {
                originalFilename: input.originalFilename,
                fileSize: fileBuffer.length
            }
        };

        // 1. Register Batch
        const registered = await batchRegistrationService.register({
            filePath: input.filePath,
            batchName,
            sourceMetadata,
            metadata: {
                originalFilename: input.originalFilename,
                format,
                uploadedBy: input.userId ?? null
            }
        });

        const batchId = registered.batchId;

        // Set status to PROCESSING
        await db.query(
            `UPDATE ingestion_batches SET status = 'PROCESSING', started_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [batchId]
        );

        // 2. Read structured rows for staging
        const structuredRows = isCsv
            ? csvSourceAdapter.readAll(input.filePath)
            : excelSourceAdapter.readAll(input.filePath);

        let processedCount = 0;
        let duplicateCount = 0;
        let failedCount = 0;

        for (const row of structuredRows) {
            const processed = await processExternalLeadRow(
                row.payload,
                row.rowIndex
            );

            let status: any = "NORMALIZED";
            if (processed.validation.status === "REJECTED") {
                status = "REJECTED";
                failedCount++;
            } else if (
                processed.dedup &&
                processed.dedup.decision === "DUPLICATE"
            ) {
                status = "DUPLICATE";
                duplicateCount++;
            } else {
                processedCount++;
            }

            await stageLead({
                batchId,
                rowIndex: row.rowIndex,
                rawPayload: processed.rawPayload,
                companyName: processed.normalized?.companyName,
                normalizedCompanyName:
                    processed.normalized?.normalizedCompanyName,
                website: processed.normalized?.website,
                domain: processed.normalized?.domain,
                contactName: processed.normalized?.contactName,
                contactEmail: processed.normalized?.contactEmail,
                contactTitle: processed.normalized?.contactTitle,
                phone: processed.normalized?.phone,
                address: processed.normalized?.address,
                city: processed.normalized?.city,
                country: processed.normalized?.country,
                industry: processed.normalized?.industry,
                source: isCsv ? "CSV" : "EXCEL",
                provider: "LOCAL_FILE",
                sourceUrl: processed.normalized?.sourceUrl,
                sourceExternalId: processed.normalized?.sourceExternalId,
                dedupKey: processed.normalized?.normalizedCompanyName ?? null,
                status,
                errorMessage:
                    processed.validation.status === "REJECTED"
                        ? processed.validation.errors.join("; ")
                        : null
            });
        }

        // 3. Build Mapping Preview Matrix & Review Session
        const rawMatrix = isCsv
            ? this.buildCsvRawMatrix(input.filePath)
            : excelRawMatrixReader.readAll(input.filePath).rows;

        const preview = buildMappingPreview(rawMatrix, {
            fileName: input.originalFilename
        });

        const reviewSession =
            await mappingReviewSessionService.createReviewSession({
                preview,
                filePath: input.filePath,
                sourceChecksum: checksum,
                batchId,
                createdBy: input.userId ?? null
            });

        // 4. Update Batch status to COMPLETED
        await db.query(
            `UPDATE ingestion_batches
             SET status = 'COMPLETED',
                 total_records = $2,
                 processed_records = $3,
                 duplicate_records = $4,
                 failed_records = $5,
                 completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [
                batchId,
                structuredRows.length,
                processedCount,
                duplicateCount,
                failedCount
            ]
        );

        return {
            batch: {
                id: batchId,
                batchName,
                source: sourceMetadata.source,
                provider: sourceMetadata.provider ?? "LOCAL_FILE",
                status: "COMPLETED",
                totalRecords: structuredRows.length,
                processedRecords: processedCount,
                duplicateRecords: duplicateCount,
                failedRecords: failedCount
            },
            reviewSession: {
                id: reviewSession.id,
                status: reviewSession.status,
                sourceChecksum: reviewSession.sourceChecksum,
                sectionCount: preview.sections.length
            }
        };
    }

    /**
     * Promotes staged leads to live companies and leads ONLY after
     * mapping review session approval.
     */
    async promoteApprovedBatch(input: {
        batchId: string;
        userId?: string | null;
    }): Promise<PromoteBatchResult> {
        // 1. Verify that the batch has an APPROVED mapping review session
        const sessionRes = await db.query(
            `SELECT id, status FROM mapping_review_sessions WHERE batch_id = $1 LIMIT 1`,
            [input.batchId]
        );

        const session = sessionRes.rows[0];
        if (!session) {
            throw new Error(
                `No mapping review session found for batch ${input.batchId}. Mapping review is required before promotion.`
            );
        }

        if (session.status !== "APPROVED") {
            throw new Error(
                `Cannot promote batch: mapping review session ${session.id} is in '${session.status}' status. Requires APPROVED status.`
            );
        }

        // 2. Fetch staged leads for this batch that have not been promoted
        const stagedRes = await db.query(
            `SELECT * FROM raw_lead_staging
             WHERE batch_id = $1
               AND status IN ('NORMALIZED', 'PROCESSED')
               AND lead_id IS NULL
             ORDER BY row_index ASC`,
            [input.batchId]
        );

        let importedCount = 0;
        let skippedCount = 0;

        for (const staged of stagedRes.rows) {
            if (!staged.company_name && !staged.normalized_company_name) {
                skippedCount++;
                continue;
            }

            const companyName =
                staged.company_name || staged.normalized_company_name;

            // Find or create company
            let companyId: string;
            const existingCompany = await db.query(
                `SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
                [companyName]
            );

            if (existingCompany.rows[0]) {
                companyId = existingCompany.rows[0].id;
            } else {
                const insertedComp = await db.query(
                    `INSERT INTO companies (name, website, phone, city, country)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [
                        companyName,
                        staged.website ?? null,
                        staged.phone ?? null,
                        staged.city ?? null,
                        staged.country ?? null
                    ]
                );
                companyId = insertedComp.rows[0].id;
            }

            // Find or create contact if name or email provided
            let contactId: string | null = null;
            if (staged.contact_name || staged.contact_email) {
                const nameParts = (staged.contact_name || "Lead Contact").trim().split(/\s+/);
                const firstName = nameParts[0] || "Lead";
                const lastName = nameParts.slice(1).join(" ") || "Contact";
                const contactEmail =
                    staged.contact_email ||
                    `contact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@staging.operix`;

                const contactRes = await db.query(
                    `INSERT INTO contacts (company_id, first_name, last_name, email, role)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
                     RETURNING id`,
                    [
                        companyId,
                        firstName,
                        lastName,
                        contactEmail,
                        staged.contact_title ?? "Lead"
                    ]
                );
                contactId = contactRes.rows[0].id;
            }

            // Create lead
            const insertedLead = await db.query(
                `INSERT INTO leads (
                    company_id,
                    contact_id,
                    status,
                    ingestion_batch_id
                 )
                 VALUES ($1, $2, 'NEW', $3)
                 RETURNING id`,
                [
                    companyId,
                    contactId,
                    input.batchId
                ]
            );

            const leadId = insertedLead.rows[0].id;

            // Update staging record
            await db.query(
                `UPDATE raw_lead_staging
                 SET lead_id = $1,
                     company_id = $2,
                     status = 'PROCESSED',
                     processed_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [leadId, companyId, staged.id]
            );

            importedCount++;
        }

        // Update batch imported_records count
        await db.query(
            `UPDATE ingestion_batches
             SET imported_records = imported_records + $2
             WHERE id = $1`,
            [input.batchId, importedCount]
        );

        return {
            batchId: input.batchId,
            importedCount,
            skippedCount
        };
    }

    /**
     * Lists recent ingestion batches with linked review session info.
     */
    async listBatches(limit: number = 20): Promise<any[]> {
        const result = await db.query(
            `SELECT
                b.id,
                b.batch_name,
                b.source,
                b.provider,
                b.status,
                b.total_records,
                b.processed_records,
                b.imported_records,
                b.duplicate_records,
                b.failed_records,
                b.created_at,
                b.completed_at,
                s.id as review_session_id,
                s.status as review_session_status
             FROM ingestion_batches b
             LEFT JOIN mapping_review_sessions s ON s.batch_id = b.id
             ORDER BY b.created_at DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows;
    }

    private buildCsvRawMatrix(
        filePath: string
    ): Array<{ rowIndex: number; values: unknown[] }> {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);

        return lines.map((line, index) => ({
            rowIndex: index + 1,
            values: line.split(",").map((v) => v.trim())
        }));
    }
}

export const externalLeadIngestionOrchestrator =
    new ExternalLeadIngestionOrchestrator();
