import {
    RawRecord,
    ValidatedLead
} from './types/acquisition-types';
import { acquisitionPipeline } from './acquisition-pipeline';
import { campaignManager } from './campaign-manager';
import { csvImporter } from './providers/csv-importer';
import { discoveryProvider } from '../chat/discovery-provider';
import { leadPersistenceService } from './lead-persistence-service';

export interface AcquisitionRunResult {
    campaignId: string;
    totalProcessed: number;
    validLeads: ValidatedLead[];
    duplicatesCount: number;
    errors: string[];
}

export class AcquisitionService {
    async importFromCSV(
        campaignId: string,
        filePath: string,
        mapping: Record<string, string>
    ): Promise<AcquisitionRunResult> {
        const campaign = await campaignManager.getCampaign(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        const rawRecords = await csvImporter.parseCSV(filePath, mapping);
        const validLeads: ValidatedLead[] = [];
        let duplicates = 0;
        const errors: string[] = [];

        const batchCompanies: ValidatedLead['company'][] = [];

        for (const raw of rawRecords) {
            const result = await acquisitionPipeline.process(
                raw,
                batchCompanies
            );

            if (result.success && result.lead) {
                validLeads.push(result.lead);
                batchCompanies.push(result.lead.company);
            } else if (result.duplicateStatus === 'DUPLICATE') {
                duplicates++;
            } else if (result.error) {
                errors.push(result.error);
            }
        }

        await campaignManager.updateMetrics(campaignId, {
            discovered: rawRecords.length,
            valid: validLeads.length,
            duplicates
        });

        return {
            campaignId,
            totalProcessed: rawRecords.length,
            validLeads,
            duplicatesCount: duplicates,
            errors
        };
    }

    async discoverBusinesses(
        campaignId: string,
        providerName: string,
        query: any
    ): Promise<AcquisitionRunResult> {
        const campaign = await campaignManager.getCampaign(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        const instruction =
            typeof query?.instruction === 'string' && query.instruction.trim()
                ? query.instruction.trim()
                : campaign.name;

        const searchTerms =
            Array.isArray(query?.searchTerms)
                ? query.searchTerms
                    .filter((term: unknown): term is string =>
                        typeof term === 'string' && term.trim().length > 0
                    )
                    .map((term: string) => term.trim())
                : undefined;

        const locationQuery =
            typeof query?.locationQuery === 'string' && query.locationQuery.trim()
                ? query.locationQuery.trim()
                : null;

        const discoveryResult = await discoveryProvider.discover({
            instruction,
            searchTerms,
            locationQuery
        });

        const validLeads: ValidatedLead[] = [];
        let duplicates = 0;
        const errors: string[] = [];

        const batchCompanies: ValidatedLead['company'][] = [];

        for (const discovered of discoveryResult.leads) {
            const raw: RawRecord = {
                companyName: discovered.name,
                website: discovered.website,
                phone: discovered.phone,
                email: discovered.email,
                address: discovered.address,
                source: discovered.source || discoveryResult.provider,
                provider: discoveryResult.provider || providerName || 'MANUAL',
                rawMetadata: discovered.metadata || {}
            };

            const result = await acquisitionPipeline.process(
                raw,
                batchCompanies
            );

            if (result.success && result.lead) {
                validLeads.push(result.lead);
                batchCompanies.push(result.lead.company);

                try {
                    await leadPersistenceService.persist({
                        campaignId,
                        company: result.lead.company,
                        contact: result.lead.contact
                    });
                } catch (error: any) {
                    errors.push(
                        `Persistence failed for "${discovered.name}": ${
                            error?.message || 'Unknown persistence error'
                        }`
                    );
                }
            } else if (result.duplicateStatus === 'DUPLICATE') {
                duplicates++;
            } else if (result.error) {
                errors.push(
                    `Pipeline failed for "${discovered.name}": ${result.error}`
                );
            }
        }

        await campaignManager.updateMetrics(campaignId, {
            discovered: discoveryResult.leads.length,
            valid: validLeads.length,
            duplicates
        });

        return {
            campaignId,
            totalProcessed: discoveryResult.leads.length,
            validLeads,
            duplicatesCount: duplicates,
            errors
        };
    }
}

export const acquisitionService = new AcquisitionService();
