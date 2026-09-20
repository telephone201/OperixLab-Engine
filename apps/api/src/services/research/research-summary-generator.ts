/**
 * @file research-summary-generator.ts
 * @description Synthesizes collected evidence into a structured business intelligence summary.
 */

import { EvidenceClaim } from './evidence-extractor';

export interface ResearchSummary {
    companyIdentity: string;
    businessModel: string;
    customerType: string;
    operationalSignals: string[];
    digitalSignals: string[];
    automationSignals: string[];
    researchGaps: string[];
    overallConfidence: number;
    evidenceList: EvidenceClaim[];
}

export class ResearchSummaryGenerator {
    /**
     * Generates a structured summary based on collected evidence and inferred data.
     */
    async generate(companyName: string, claims: EvidenceClaim[], inferredData: Record<string, any>): Promise<ResearchSummary> {
        const observedSignals: string[] = [];
        const digitalSignals: string[] = [];
        const automationSignals: string[] = [];
        const gaps: string[] = [];

        // Process claims to extract signals
        claims.forEach(claim => {
            const text = claim.claim.toLowerCase();
            if (text.includes('booking') || text.includes('appointment')) {
                automationSignals.push(claim.claim);
            }
            if (text.includes('crm') || text.includes('hubspot') || text.includes('salesforce')) {
                digitalSignals.push(claim.claim);
            }
            if (text.includes('process') || text.includes('workflow') || text.includes('manual')) {
                observedSignals.push(claim.claim);
            }
        });

        // Check for gaps (Simplified for Phase 4)
        if (!claims.some(c => c.claim.toLowerCase().includes('decision maker'))) {
            gaps.push('Decision Maker identity is unknown');
        }
        if (!claims.some(c => c.claim.toLowerCase().includes('revenue') || c.claim.toLowerCase().includes('model'))) {
            gaps.push('Business revenue model is not explicitly verified');
        }

        return {
            companyIdentity: companyName,
            businessModel: inferredData.businessModel || 'UNKNOWN',
            customerType: inferredData.customerType || 'UNKNOWN',
            operationalSignals: observedSignals,
            digitalSignals: digitalSignals,
            automationSignals: automationSignals,
            researchGaps: gaps,
            overallConfidence: claims.length > 0 ?
                claims.reduce((acc, c) => acc + c.confidence, 0) / claims.length : 0,
            evidenceList: claims
        };
    }
}

export const summaryGenerator = new ResearchSummaryGenerator();
