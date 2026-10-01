/**
 * @file workflow-match-ranker.ts
 * @description Implements an explainable, weighted ranking system for eligible candidates.
 * Match Score is a ranking signal, NOT an eligibility decision.
 */

import { workflowEvidenceProvider } from '../inventory/workflow-evidence-provider';
import { triggerCompatibilityService } from './trigger-compatibility-service';

export interface ScoringComponent {
    dimension: string;
    value: number; // 0.0 to 1.0
    weight: number;
    reasoning: string;
    evidence: string;
}

export interface MatchRank {
    workflowId: string;
    totalScore: number;
    components: ScoringComponent[];
    rank: number;
}

export class WorkflowMatchRanker {
    private weights = {
        coverage: 0.4,
        triggerFit: 0.2,
        integrationFit: 0.2,
        quality: 0.2
    };

    /**
     * Ranks candidates that have already passed the Hard Gates.
     */
    async rank(candidates: any[], requirements: any[]): Promise<MatchRank[]> {
        console.log(`[RANKER] Ranking ${candidates.length} eligible candidates...`);

        const ranks = await Promise.all(candidates.map(async candidate => {
            const components = await this.calculateComponents(candidate, requirements);
            const totalScore = components.reduce((acc, comp) => acc + (comp.value * comp.weight), 0);

            return {
                workflowId: candidate.workflow_id,
                totalScore,
                components,
                rank: 0
            };
        }));
        // Sort by total score descending
        ranks.sort((a, b) => b.totalScore - a.totalScore);

        // Assign rank
        return ranks.map((r, i) => ({ ...r, rank: i + 1 }));
    }

    private async calculateComponents(candidate: any, requirements: any[]): Promise<ScoringComponent[]> {
        return [
            this.scoreCoverage(candidate, requirements),
            await this.scoreTriggerFit(candidate, requirements),
            await this.scoreIntegrationFit(candidate, requirements),
            this.scoreQuality(candidate)
        ];
    }

    private scoreCoverage(candidate: any, requirements: any[]): ScoringComponent {
        const requirementCount = requirements.length;

        if (requirementCount === 0) {
            return {
                dimension: 'REQUIREMENT_COVERAGE',
                value: 0,
                weight: this.weights.coverage,
                reasoning: 'Requirement coverage cannot be established without requirements.',
                evidence: 'No requirements were supplied.'
            };
        }

        return {
            dimension: 'REQUIREMENT_COVERAGE',
            value: 0,
            weight: this.weights.coverage,
            reasoning: 'Business requirement coverage is not inferred from workflow metadata.',
            evidence: `Coverage is UNKNOWN for ${requirementCount} requirement(s); source evidence does not directly establish business-level requirement coverage.`
        };
    }
    private async scoreTriggerFit(candidate: any, requirements: any[]): Promise<ScoringComponent> {
        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(candidate.id);

        if (!context) {
            return {
                dimension: 'TRIGGER_FIT',
                value: 0,
                weight: this.weights.triggerFit,
                reasoning: 'Trigger fit cannot be established from source evidence.',
                evidence: 'Workflow source evidence unavailable.'
            };
        }

        const triggerRequirement = requirements.find(
            requirement => typeof requirement?.trigger_definition === 'string' &&
                requirement.trigger_definition.trim().length > 0
        );

        const compatibility = triggerCompatibilityService.evaluate(
            triggerRequirement?.trigger_definition,
            context.evidence.triggers
        );

        return {
            dimension: 'TRIGGER_FIT',
            value: compatibility.status === 'PASS' ? 1 : 0,
            weight: this.weights.triggerFit,
            reasoning: compatibility.reason,
            evidence: compatibility.evidence
        };
    }
    private async scoreIntegrationFit(candidate: any, requirements: any[]): Promise<ScoringComponent> {
        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(candidate.id);

        if (!context) {
            return {
                dimension: 'INTEGRATION_FIT',
                value: 0,
                weight: this.weights.integrationFit,
                reasoning: 'Integration fit cannot be established from source evidence.',
                evidence: 'Workflow source evidence unavailable.'
            };
        }

        const requiredIntegrations = [
            ...new Set(
                requirements.flatMap(requirement => {
                    const value = requirement?.integration_requirements;

                    if (Array.isArray(value)) {
                        return value
                            .filter(item => typeof item === 'string')
                            .map(item => item.trim())
                            .filter(Boolean);
                    }

                    if (typeof value === 'string') {
                        return value
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean);
                    }

                    return [];
                })
            )
        ];

        if (requiredIntegrations.length === 0) {
            return {
                dimension: 'INTEGRATION_FIT',
                value: 0,
                weight: this.weights.integrationFit,
                reasoning: 'No integration requirements were supplied.',
                evidence: 'No integration_requirements present in requirements.'
            };
        }

        const observedIntegrations = new Set(
            context.evidence.integrations.map(integration => integration.trim().toLowerCase())
        );

        const matched = requiredIntegrations.filter(integration =>
            observedIntegrations.has(integration.toLowerCase())
        );

        const value = matched.length / requiredIntegrations.length;

        return {
            dimension: 'INTEGRATION_FIT',
            value,
            weight: this.weights.integrationFit,
            reasoning: `${matched.length} of ${requiredIntegrations.length} required integrations were observed in the workflow source.`,
            evidence: `Required: [${requiredIntegrations.join(', ')}]. Observed matches: [${matched.join(', ')}].`
        };
    }
    private scoreQuality(candidate: any): ScoringComponent {
        const rawQuality = Number(candidate.quality_score);

        if (!Number.isFinite(rawQuality)) {
            return {
                dimension: 'WORKFLOW_QUALITY',
                value: 0,
                weight: this.weights.quality,
                reasoning: 'Workflow quality cannot be established because the indexed quality score is unavailable.',
                evidence: 'quality_score is missing or invalid in workflow library metadata.'
            };
        }

        const qualityNormalized = Math.max(0, Math.min(100, rawQuality)) / 100;

        return {
            dimension: 'WORKFLOW_QUALITY',
            value: qualityNormalized,
            weight: this.weights.quality,
            reasoning: `Based on indexed quality score of ${rawQuality}.`,
            evidence: `Workflow library quality_score=${rawQuality}.`
        };
    }
}

