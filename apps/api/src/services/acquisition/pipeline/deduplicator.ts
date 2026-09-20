/**
 * @file deduplicator.ts
 * @description Weighted deduplication logic for lead acquisition.
 */

import { NormalizedCompany, DuplicateStatus } from '../types/acquisition-types';

export interface DeduplicationResult {
    status: DuplicateStatus;
    canonicalId?: string;
    confidence: number;
}

export class DeduplicationService {
    /**
     * Compare a normalized company against existing companies.
     * In a real implementation, this would query the database.
     */
    async findDuplicate(company: NormalizedCompany, existingCompanies: NormalizedCompany[]): Promise<DeduplicationResult> {
        for (const existing of existingCompanies) {
            // High Confidence: Exact Domain Match
            if (company.domain && existing.domain && company.domain === existing.domain) {
                return { status: DuplicateStatus.DUPLICATE, confidence: 1.0 };
            }

            // High Confidence: Exact Phone Match
            if (company.phone && existing.phone && company.phone === existing.phone) {
                return { status: DuplicateStatus.DUPLICATE, confidence: 0.95 };
            }

            // Medium Confidence: Normalized Name + City Match
            if (
                company.normalizedName === existing.normalizedName &&
                company.city && existing.city &&
                company.city.toLowerCase() === existing.city.toLowerCase()
            ) {
                return { status: DuplicateStatus.POSSIBLE_DUPLICATE, confidence: 0.7 };
            }
        }

        return { status: DuplicateStatus.CANONICAL, confidence: 1.0 };
    }
}

export const deduplicator = new DeduplicationService();
