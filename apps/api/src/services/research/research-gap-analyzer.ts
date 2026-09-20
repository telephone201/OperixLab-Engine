/**
 * @file research-gap-analyzer.ts
 * @description Identifies missing information in company research to guide further discovery.
 */

export interface ResearchGap {
    field: string;
    status: 'UNKNOWN' | 'NEEDS_RESEARCH' | 'RESEARCHED' | 'VERIFIED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
}

export class ResearchGapAnalyzer {
    private criticalFields: Array<{
        name: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [
        { name: 'decision_maker', priority: 'HIGH' },
        { name: 'business_model', priority: 'HIGH' },
        { name: 'crm_system', priority: 'MEDIUM' },
        { name: 'lead_handling_process', priority: 'MEDIUM' },
        { name: 'automation_maturity', priority: 'LOW' }
    ];

    async analyze(claims: any[], metadata: any): Promise<ResearchGap[]> {
        const gaps: ResearchGap[] = [];
        const claimTexts = claims.map(c => c.claim.toLowerCase()).join(' ').toLowerCase();

        for (const field of this.criticalFields) {
            const isPresent = claimTexts.includes(field.name.replace('_', ' '));

            if (!isPresent) {
                gaps.push({
                    field: field.name,
                    status: 'NEEDS_RESEARCH',
                    priority: field.priority,
                    reason: `No evidence found for ${field.name.replace('_', ' ')}`
                });
            } else {
                gaps.push({
                    field: field.name,
                    status: 'RESEARCHED',
                    priority: field.priority,
                    reason: 'Found in evidence'
                });
            }
        }

        return gaps;
    }
}

export const gapAnalyzer = new ResearchGapAnalyzer();
