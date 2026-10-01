import crypto from "crypto";
import fs from "fs";
import { db } from "../../../lib/db";
import type { ExternalSourceMetadata } from "./adapters/external-source-reader";

export interface RegisterIngestionBatchInput {
    filePath: string;
    batchName: string;
    sourceMetadata: ExternalSourceMetadata;
    metadata?: Record<string, unknown>;
}

export interface RegisteredIngestionBatch {
    batchId: string;
    created: boolean;
}

export class BatchRegistrationService {
    async register(
        input: RegisterIngestionBatchInput,
    ): Promise<RegisteredIngestionBatch> {
        const fileBuffer = fs.readFileSync(input.filePath);

        const checksum = crypto
            .createHash("sha256")
            .update(fileBuffer)
            .digest("hex");

        const existing = await db.query(
            `
            SELECT id
            FROM ingestion_batches
            WHERE metadata->>'checksum' = $1
            LIMIT 1
            `,
            [checksum],
        );

        if (existing.rows[0]) {
            return {
                batchId: existing.rows[0].id,
                created: false,
            };
        }

        const batchMetadata = {
            ...(input.metadata ?? {}),
            format: input.sourceMetadata.format,
            country: input.sourceMetadata.country ?? null,
            source_metadata: input.sourceMetadata.metadata ?? {},
            checksum,
        };

        const result = await db.query(
            `
            INSERT INTO ingestion_batches (
                batch_name,
                source,
                provider,
                metadata
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [
                input.batchName,
                input.sourceMetadata.source,
                input.sourceMetadata.provider,
                batchMetadata,
            ],
        );

        return {
            batchId: result.rows[0].id,
            created: true,
        };
    }
}

export const batchRegistrationService =
    new BatchRegistrationService();
