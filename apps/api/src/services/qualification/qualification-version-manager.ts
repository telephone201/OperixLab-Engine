/**
 * @file qualification-version-manager.ts
 * @description Manages versioning of qualification results to track changes over time.
 */

import { QualificationResult } from './qualification-types';

export class QualificationVersionManager {
    /**
     * Handles the persistence and versioning logic for qualification results.
     * In a full implementation, this would interact with the database via a Repository.
     */
    async saveResult(result: QualificationResult): Promise<void> {
        // Logic:
        // 1. Check if current version exists for leadId.
        // 2. If the total score has changed significantly, increment version.
        // 3. Save to the 'qualifications' table.

        console.log(`[VERSION_MANAGER] Saving qualification version ${result.version} for lead ${result.leadId} with score ${result.totalScore}`);

        // Mock database call
        // await db.qualifications.insert(result);
    }

    async getLatestResult(leadId: string): Promise<QualificationResult | null> {
        // Mock database call
        // return await db.qualifications.findLatest(leadId);
        return null;
    }
}
