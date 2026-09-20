/**
 * @file acquisition-service.ts
 * @description High-level service that exposes acquisition functionality to the API.
 */

import {
    RawRecord,
    ValidatedLead,
    LeadState
} from './types/acquisition-types';
import { acquisitionPipeline } from './acquisition-pipeline';
import { campaignManager } from './campaign-manager';
import { csvImporter } from './providers/csv-importer';

export interface AcquisitionRunResult {
    campaignId: string;
    totalProcessed: number;
    validLeads: ValidatedLead[];
    duplicatesCount: number;
    errors: string[];
}

export class AcquisitionService {
    /**
     * Imports leads from a CSV file and processes them through the pipeline.
     */
    async importFromCSV(campaignId: string, filePath: string, mapping: Record<string, string>): Promise<AcquisitionRunResult> {
        const campaign = await campaignManager.getCampaign(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        const rawRecords = await csvImporter.parseCSV(filePath, mapping);
        const validLeads: ValidatedLead[] = [];
        let duplicates = 0;
        const errors: string[] = [];

        for (const raw of rawRecords) {
            const result = await acquisitionPipeline.process(raw);
            if (result.success && result.lead) {
                validLeads.push(result.lead);
            } else if (result.duplicateStatus === 'DUPLICATE') {
                duplicates++;
            } else if (result.error) {
                errors.push(result.error);
            }
        }

        await campaignManager.updateMetrics(campaignId, {
            discovered: rawRecords.length,
            valid: validLeads.length,
            duplicates: duplicates
        });

        return {
            campaignId,
            totalProcessed: rawRecords.length,
            validLeads,
            duplicatesCount: duplicates,
            errors
        };
    }

    /**
     * Discovers businesses using a specific provider.
     */
    async discoverBusinesses(campaignId: string, providerName: string, query: any): Promise<AcquisitionRunResult> {
        // In a real implementation, this would dynamically resolve the provider from a provider factory.
        // For now, we simulate a discovery run.

        const campaign = await campaignManager.getCampaign(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        // Mock discovery results for demonstration/testing
        const mockRawRecords: RawRecord[] = [
            {
                companyName: 'Test Pharmacy 001',
                website: 'https://testpharmacy001.com',
                phone: '+20123456789',
                city: 'Cairo',
                source: 'GOOGLE_MAPS',
                provider: 'ManualLocalBusinessProvider',
                rawMetadata: {}
            }
        ];

        const validLeads: ValidatedLead[] = [];
        let duplicates = 0;
        const errors: string[] = [];

        for (const raw of mockRawRecords) {
            const result = await acquisitionPipeline.process(raw);
            if (result.success && result.lead) {
                validLeads.push(result.lead);
            } else if (result.duplicateStatus === 'DUPLICATE') {
                duplicates++;
            } else if (result.error) {
                errors.push(result.error);
            }
        }

        await campaignManager.updateMetrics(campaignId, {
            discovered: mockRawRecords.length,
            valid: validLeads.length,
            duplicates: duplicates
        });

        return {
            campaignId,
            totalProcessed: mockRawRecords.length,
            validLeads,
            duplicatesCount: duplicates,
            errors
        };
    }
}

export const acquisitionService = new AcquisitionService();
