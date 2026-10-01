import { acquisitionPipeline } from '../acquisition/acquisition-pipeline';
import {
    RawRecord,
    NormalizedCompany,
    DuplicateStatus,
    LeadState
} from '../acquisition/types/acquisition-types';
import { leadPersistenceService } from '../acquisition/lead-persistence-service';
import type { DiscoveredLead } from './discovery-provider';

export interface ChatLeadIntakeResult {
    persistedLeadIds: string[];
    persistedCount: number;
    duplicateCount: number;
    skippedCount: number;
    errorCount: number;
    errors: string[];
}

export class ChatLeadIntakeService {
    async intake(leads: DiscoveredLead[]): Promise<ChatLeadIntakeResult> {
        const result: ChatLeadIntakeResult = {
            persistedLeadIds: [],
            persistedCount: 0,
            duplicateCount: 0,
            skippedCount: 0,
            errorCount: 0,
            errors: []
        };

        const existingCompanies = await this.loadExistingCompanies(leads);
        const batchCompanies: NormalizedCompany[] = [...existingCompanies];

        for (const discoveredLead of leads) {
            try {
                const raw = this.toRawRecord(discoveredLead);

                const pipelineResult = await acquisitionPipeline.process(
                    raw,
                    batchCompanies
                );

                if (!pipelineResult.success || !pipelineResult.lead) {
                    if (pipelineResult.duplicateStatus === DuplicateStatus.DUPLICATE) {
                        result.duplicateCount++;
                    } else {
                        result.skippedCount++;
                        if (pipelineResult.error) result.errors.push(pipelineResult.error);
                    }
                    continue;
                }

                if (pipelineResult.duplicateStatus === DuplicateStatus.POSSIBLE_DUPLICATE) {
                    result.duplicateCount++;
                    continue;
                }

                if (pipelineResult.lead.status === LeadState.INVALID) {
                    result.skippedCount++;
                    result.errors.push('Lead failed validation (INVALID)');
                    continue;
                }

                const persisted = await leadPersistenceService.persist(pipelineResult.lead);
                result.persistedLeadIds.push(persisted.leadId);
                result.persistedCount++;
                batchCompanies.push(pipelineResult.lead.company);
            } catch (error: unknown) {
                result.errorCount++;
                result.errors.push(
                    error instanceof Error
                        ? error.message
                        : 'Failed to persist discovered lead'
                );
            }
        }

        return result;
    }

    private async loadExistingCompanies(
        leads: DiscoveredLead[]
    ): Promise<NormalizedCompany[]> {
        const domains = Array.from(
            new Set(
                leads
                    .map((lead) => this.extractDomain(lead.website))
                    .filter((domain): domain is string => Boolean(domain))
            )
        );

        if (domains.length === 0) return [];

        const rows = await this.queryExistingCompanies(domains);

        return rows.map((row) => ({
            companyName: row.name,
            normalizedName: row.name,
            website: row.website || null,
            domain: row.domain || null,
            phone: null,
            address: null,
            city: null,
            country: null,
            source: 'DATABASE',
            provider: 'DATABASE',
            sourceUrl: null
        }));
    }

    private async queryExistingCompanies(
        domains: string[]
    ): Promise<
        Array<{
            name: string;
            domain: string | null;
            website: string | null;
        }>
    > {
        const { db } = await import('../../lib/db');

        return db.companies.findMany({
            where: {
                domain: {
                    in: domains
                }
            }
        }) as Promise<
            Array<{
                name: string;
                domain: string | null;
                website: string | null;
            }>
        >;
    }

    private toRawRecord(lead: DiscoveredLead): RawRecord {
        return {
            companyName: lead.name,
            website: lead.website,
            phone: lead.phone,
            address: lead.address,
            source: lead.source,
            provider: lead.source,
            email: lead.email,
            rawMetadata: lead.metadata || {}
        };
    }

    private extractDomain(website?: string): string | null {
        if (!website) return null;

        try {
            const parsed = new URL(
                website.startsWith('http')
                    ? website
                    : `https://${website}`
            );

            return parsed.hostname
                .replace(/^www\./, '')
                .toLowerCase();
        } catch {
            return null;
        }
    }
}

export const chatLeadIntakeService = new ChatLeadIntakeService();
