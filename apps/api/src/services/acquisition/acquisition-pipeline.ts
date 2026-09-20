/**
 * @file acquisition-pipeline.ts
 * @description Orchestrates the flow from raw lead source to validated database entry.
 */

import {
    RawRecord,
    ValidatedLead,
    LeadState,
    DuplicateStatus
} from './types/acquisition-types';
import { normalizer } from './pipeline/normalizer';
import { deduplicator } from './pipeline/deduplicator';
import { validator } from './pipeline/validator';

export interface PipelineResult {
    success: boolean;
    lead?: ValidatedLead;
    duplicateStatus?: DuplicateStatus;
    error?: string;
}

export class AcquisitionPipeline {
    /**
     * Process a single raw record through the full ingestion pipeline.
     * @param raw The raw record from a provider
     * @param existingCompanies Mock or actual list of existing companies for deduplication
     */
    async process(raw: RawRecord, existingCompanies: any[] = []): Promise<PipelineResult> {
        try {
            // 1. Normalize
            const normalizedCompany = normalizer.normalizeCompany(raw);
            const normalizedContact = normalizer.normalizeContact(raw);

            // 2. Deduplicate
            const dedupResult = await deduplicator.findDuplicate(normalizedCompany, existingCompanies);

            if (dedupResult.status === DuplicateStatus.DUPLICATE) {
                return {
                    success: true,
                    duplicateStatus: DuplicateStatus.DUPLICATE,
                    error: 'Lead is a duplicate of an existing company.'
                };
            }

            // 3. Validate
            const validatedLead = validator.validate(normalizedCompany, normalizedContact);

            return {
                success: true,
                lead: validatedLead,
                duplicateStatus: dedupResult.status
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown pipeline error'
            };
        }
    }
}

export const acquisitionPipeline = new AcquisitionPipeline();
