import { db } from "../../../lib/db";

export type StagingLeadStatus =
    | "PENDING"
    | "NORMALIZED"
    | "PROCESSED"
    | "DUPLICATE"
    | "FAILED"
    | "REJECTED";

export interface StageLeadInput {
    batchId: string;
    rowIndex: number;
    rawPayload: Record<string, unknown>;
    companyName?: string | null;
    normalizedCompanyName?: string | null;
    website?: string | null;
    domain?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactTitle?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    industry?: string | null;
    source?: string | null;
    provider?: string | null;
    sourceUrl?: string | null;
    sourceExternalId?: string | null;
    dedupKey?: string | null;
    status?: StagingLeadStatus;
    errorMessage?: string | null;
}

export async function stageLead(input: StageLeadInput) {
    const result = await db.query(
        `
        INSERT INTO raw_lead_staging (
            batch_id,
            row_index,
            raw_payload,
            company_name,
            normalized_company_name,
            website,
            domain,
            contact_name,
            contact_email,
            contact_title,
            phone,
            address,
            city,
            country,
            industry,
            source,
            provider,
            source_url,
            source_external_id,
            dedup_key,
            status,
            error_message
        )
        VALUES (
            $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22
        )
        RETURNING
            id,
            batch_id,
            row_index,
            status,
            error_message,
            raw_payload
        `,
        [
            input.batchId,
            input.rowIndex,
            JSON.stringify(input.rawPayload),
            input.companyName ?? null,
            input.normalizedCompanyName ?? null,
            input.website ?? null,
            input.domain ?? null,
            input.contactName ?? null,
            input.contactEmail ?? null,
            input.contactTitle ?? null,
            input.phone ?? null,
            input.address ?? null,
            input.city ?? null,
            input.country ?? null,
            input.industry ?? null,
            input.source ?? null,
            input.provider ?? null,
            input.sourceUrl ?? null,
            input.sourceExternalId ?? null,
            input.dedupKey ?? null,
            input.status ?? "PENDING",
            input.errorMessage ?? null,
        ],
    );

    return result.rows[0];
}
