import { classifyExternalLeadRecord } from "./external-lead-classifier";
import {
    normalizeExternalLead,
    type NormalizedExternalLead,
} from "./external-lead-normalizer";
import {
    validateExternalLead,
    type ExternalLeadValidationResult,
} from "./external-lead-validator";
import {
    deduplicateExternalLeadFromRepository,
    type ExternalLeadDedupResult,
} from "./external-lead-dedup-service";

export interface ProcessedExternalLeadRow {
    rowIndex: number;
    recordType: ReturnType<typeof classifyExternalLeadRecord>;
    normalized: NormalizedExternalLead | null;
    validation: ExternalLeadValidationResult;
    dedup: ExternalLeadDedupResult | null;
    rawPayload: Record<string, unknown>;
}

export async function processExternalLeadRow(
    row: Record<string, unknown>,
    rowIndex: number,
): Promise<ProcessedExternalLeadRow> {
    const recordType = classifyExternalLeadRecord(row);

    if (recordType === "UNKNOWN") {
        const validation = validateExternalLead(recordType, null);

        return {
            rowIndex,
            recordType,
            normalized: null,
            validation,
            dedup: null,
            rawPayload: row,
        };
    }

    const normalized = normalizeExternalLead(row);
    const validation = validateExternalLead(recordType, normalized);

    if (validation.status === "REJECTED") {
        return {
            rowIndex,
            recordType,
            normalized,
            validation,
            dedup: null,
            rawPayload: row,
        };
    }

    const dedup = await deduplicateExternalLeadFromRepository(normalized);

    return {
        rowIndex,
        recordType,
        normalized,
        validation,
        dedup,
        rawPayload: row,
    };
}
