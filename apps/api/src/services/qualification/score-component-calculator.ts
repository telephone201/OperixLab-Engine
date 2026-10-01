/**
 * @file score-component-calculator.ts
 * @description Deterministic calculator that maps research evidence to numerical scores.
 */

import { ScoreComponent } from './qualification-types';

export interface ScoringWeights {
    icpFit: number;
    automationOpportunity: number;
    decisionMaker: number;
    commercialPotential: number;
    dataConfidence: number;
    demoPotential: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
    icpFit: 30,
    automationOpportunity: 25,
    decisionMaker: 15,
    commercialPotential: 15,
    dataConfidence: 10,
    demoPotential: 5,
};

interface ResearchEvidenceReference {
    id: string;
    text?: string;
    sourceUrl?: string | null;
    timestamp?: Date | string;
}

export class ScoreComponentCalculator {
    /**
     * Calculates a specific score component based on research evidence.
     * @param componentName The name of the component to calculate.
     * @param evidence Any research data, tech signals, or automation signals.
     * @param maxScore The maximum possible score for this component (usually the weight).
     */
    calculate(
        componentName: string,
        evidence: any,
        maxScore: number
    ): ScoreComponent {
        let score = 0;
        let reasoning = '';
        let confidence = 0;
        const evidenceIds: string[] = [];

        const researchEvidence: ResearchEvidenceReference[] =
            Array.isArray(evidence?.researchEvidence)
                ? evidence.researchEvidence
                : [];

        const allResearchEvidenceIds = researchEvidence
            .map(item => item?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        const findEvidenceIdsContaining = (patterns: string[]): string[] => {
            const normalizedPatterns = patterns.map(pattern =>
                pattern.toLowerCase()
            );

            return researchEvidence
                .filter(item => {
                    const text = typeof item?.text === 'string'
                        ? item.text.toLowerCase()
                        : '';

                    return normalizedPatterns.some(pattern =>
                        text.includes(pattern)
                    );
                })
                .map(item => item.id)
                .filter(
                    (id): id is string =>
                        typeof id === 'string' && id.length > 0
                );
        };

        switch (componentName) {
            case 'ICP Fit':
                // Logic: High score if industry/size matches target ICP
                if (evidence.industry && evidence.targetIndustry?.includes(evidence.industry)) {
                    score = maxScore;
                    reasoning = `Industry ${evidence.industry} is a primary target.`;
                    confidence = 1.0;

                    evidenceIds.push(
                        ...findEvidenceIdsContaining([evidence.industry])
                    );
                } else {
                    score = maxScore * 0.3;
                    reasoning = 'Industry is not a primary target or unknown.';
                    confidence = 0.5;
                }
                break;

            case 'Automation Opportunity':
                // Logic: High score if verified operational automation-gap signals are present.
                // Provenance is supplied by the Research -> Qualification adapter.
                const signals = evidence.automationSignals || [];
                if (signals.length > 0) {
                    const positiveSignals = signals.filter(
                        (s: any) => s.value === true
                    ).length;

                    score = (positiveSignals / signals.length) * maxScore;
                    reasoning = `Observed ${positiveSignals} automation signals.`;
                    confidence = 0.8;

                    evidenceIds.push(
                        ...signals
                            .filter((signal: any) => signal.value === true)
                            .map((signal: any) => signal.evidenceId)
                            .filter(
                                (id: any): id is string =>
                                    typeof id === 'string' && id.length > 0
                            )
                    );
                } else {
                    score = 0;
                    reasoning = 'No automation signals observed.';
                    confidence = 0.4;
                }
                break;

            case 'Decision Maker':
                // Logic: Score based on whether a verified DM was found
                if (
                    evidence.decisionMaker &&
                    evidence.decisionMaker.verified_status === 'VERIFIED'
                ) {
                    score = maxScore;
                    reasoning = `Verified Decision Maker found: ${evidence.decisionMaker.person_name}.`;
                    confidence = 1.0;
                } else if (evidence.decisionMaker) {
                    score = maxScore * 0.5;
                    reasoning = 'Decision Maker identified but not verified.';
                    confidence = 0.6;
                } else {
                    score = 0;
                    reasoning = 'No Decision Maker identified.';
                    confidence = 0.3;
                }
                break;

            case 'Commercial Potential':
                // Logic: Score based on company scale or operational complexity
                if (evidence.employeeCount && evidence.employeeCount > 50) {
                    score = maxScore;
                    reasoning = 'Company size indicates high commercial potential.';
                    confidence = 0.9;
                } else {
                    score = maxScore * 0.5;
                    reasoning = 'Smaller company size; potential is moderate.';
                    confidence = 0.7;
                }
                break;

            case 'Data Confidence':
                // Logic: Score based on the amount and quality of evidence
                const totalEvidence = evidence.evidenceCount || 0;

                if (totalEvidence > 5) {
                    score = maxScore;
                    reasoning = 'High volume of evidence available.';
                    confidence = 1.0;
                } else if (totalEvidence > 0) {
                    score = maxScore * 0.6;
                    reasoning = 'Limited evidence available.';
                    confidence = 0.7;
                } else {
                    score = 0;
                    reasoning = 'No evidence found.';
                    confidence = 0.2;
                }

                evidenceIds.push(...allResearchEvidenceIds);
                break;

            case 'Demo Potential':
                // Logic: Score based on clarity of value proposition/website
                if (evidence.websiteQuality === 'HIGH') {
                    score = maxScore;
                    reasoning = 'Clear digital presence makes for a high-impact demo.';
                    confidence = 0.8;

                    evidenceIds.push(...allResearchEvidenceIds);
                } else {
                    score = maxScore * 0.4;
                    reasoning = 'Generic or poor digital presence.';
                    confidence = 0.6;

                    if (allResearchEvidenceIds.length > 0) {
                        evidenceIds.push(...allResearchEvidenceIds);
                    }
                }
                break;

            default:
                score = 0;
                reasoning = 'Unknown component.';
                confidence = 0;
        }

        return {
            componentName,
            raw_value: JSON.stringify(evidence),
            score,
            max_score: maxScore,
            confidence,
            reasoning,
            evidence_ids: [...new Set(evidenceIds)],
            is_overridden: false,
        };
    }
}
