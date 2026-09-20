/**
 * @file pain-impact-analyzer.ts
 * @description Deterministically determines the operational and commercial impact of a pain.
 */

import { Pain, PainImpact, Severity } from './pain-types';

export class PainImpactAnalyzer {
    /**
     * Analyzes a pain to determine its impacts.
     * Does NOT invent financial numbers; focuses on categorical impact.
     */
    analyzeImpacts(pain: Pain, researchData: any): PainImpact[] {
        const impacts: PainImpact[] = [];

        // 1. Operational Impact
        if (pain.painType === 'DATA_ENTRY' || pain.painType === 'MANUAL_REPETITIVE_WORK') {
            impacts.push({
                impactType: 'STAFF_EFFORT',
                impactCategory: 'OPERATIONAL',
                level: 'HIGH',
                evidence: 'Manual repetitive tasks observed.',
                confidence: 'HIGH',
                reasoning: 'High volume of manual data entry directly increases staff workload.',
            });
        }

        if (pain.painType === 'RESPONSE_DELAY' || pain.painType === 'FOLLOW_UP') {
            impacts.push({
                impactType: 'PROCESS_DELAY',
                impactCategory: 'OPERATIONAL',
                level: 'MEDIUM',
                evidence: 'Delayed response signals observed.',
                confidence: 'MEDIUM',
                reasoning: 'Slow follow-up increases the lead-to-conversion cycle time.',
            });
        }

        // 2. Commercial Impact
        if (pain.severity === 'CRITICAL' || pain.severity === 'HIGH') {
            impacts.push({
                impactType: 'LOST_OPPORTUNITY',
                impactCategory: 'COMMERCIAL',
                level: 'HIGH',
                evidence: 'Critical operational friction identified.',
                confidence: 'MEDIUM',
                reasoning: 'Critical pains in the sales process typically result in leaked opportunities.',
            });
        }

        // 3. Customer Impact
        if (pain.painType === 'COMMUNICATION' || pain.painType === 'CUSTOMER_SUPPORT') {
            impacts.push({
                impactType: 'CUSTOMER_EXPERIENCE',
                impactCategory: 'CUSTOMER',
                level: 'MEDIUM',
                evidence: 'Fragmented communication observed.',
                confidence: 'MEDIUM',
                reasoning: 'Inconsistent communication leads to perceived lower professionality.',
            });
        }

        return impacts;
    }
}
