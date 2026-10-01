/**
 * @file strategy-decision-engine.ts
 * @description Implements deterministic strategy selection: REUSE -> CUSTOMIZE -> COMPOSE -> BUILD.
 */

import { HardGateEvaluator, GateStatus } from './hard-gate-evaluator';
import { WorkflowMatchRanker, MatchRank } from './workflow-match-ranker';
import type { CompositionPlan } from './composition-planner';

export enum SolutionStrategy {
    REUSE = 'REUSE',
    CUSTOMIZE = 'CUSTOMIZE',
    COMPOSE = 'COMPOSE',
    BUILD = 'BUILD',
    NO_MATCH = 'NO_MATCH'
}

export interface StrategyCandidate {
    workflowLibraryId: string;
    matchCandidateId: string;
    workflowId?: string;
}

export interface StrategyDecision {
    strategy: SolutionStrategy;
    primaryCandidateId?: string;
    reasoning: string;
    evidence: string;
    rejectedStrategies: { strategy: SolutionStrategy, reason: string }[];
    reviewRequired: boolean;
    reviewReason?: string;
    /** Production composition analysis (STEP 9). Set for COMPOSE successes
     * and attached to BUILD when a composition was attempted and found
     * non-viable. Null/absent for REUSE/CUSTOMIZE. */
    composition?: CompositionPlan | null;
}

/**
 * Pure provider the engine calls when the ladder reaches COMPOSE. The
 * orchestrator supplies it from the CompositionPlanner plus the genuine
 * captured coverage/gate evidence of THIS run. Returning null means
 * "composition analysis unavailable" (legacy stub behavior).
 */
export type ComposePlanProvider = (
    candidates: StrategyCandidate[],
    requirements: any[]
) => CompositionPlan | null;

export class StrategyDecisionEngine {
    constructor(
        private gateEvaluator: HardGateEvaluator,
        private ranker: WorkflowMatchRanker,
        private composePlanProvider?: ComposePlanProvider
    ) {}

    /**
     * Determines the best solution strategy for a lead.
     */
    async determineStrategy(
        leadId: string,
        candidates: StrategyCandidate[],
        requirements: any[]
    ): Promise<StrategyDecision> {
        console.log(`[STRATEGY] Determining solution strategy for lead ${leadId}...`);

        const rejected: { strategy: SolutionStrategy, reason: string }[] = [];
        let reviewRequired = false;
        const reviewReasons = new Set<string>();

        // 1. Attempt REUSE
        const reuseResult = await this.evaluateReuse(candidates, requirements);
        reviewRequired = reviewRequired || reuseResult.reviewRequired;
        if (reuseResult.reviewReason) {
            reviewReasons.add(reuseResult.reviewReason);
        }

        if (reuseResult.success) {
            return {
                strategy: SolutionStrategy.REUSE,
                primaryCandidateId: reuseResult.candidateId,
                reasoning: reuseResult.reason,
                evidence: reuseResult.evidence,
                rejectedStrategies: [],
                reviewRequired,
                reviewReason: reviewReasons.size > 0
                    ? Array.from(reviewReasons).join("; ")
                    : undefined
            };
        }
        rejected.push({ strategy: SolutionStrategy.REUSE, reason: reuseResult.reason });

        // 2. Attempt CUSTOMIZE
        const customizeResult = await this.evaluateCustomize(candidates, requirements);
        reviewRequired = reviewRequired || customizeResult.reviewRequired;
        if (customizeResult.reviewReason) {
            reviewReasons.add(customizeResult.reviewReason);
        }

        if (customizeResult.success) {
            return {
                strategy: SolutionStrategy.CUSTOMIZE,
                primaryCandidateId: customizeResult.candidateId,
                reasoning: customizeResult.reason,
                evidence: customizeResult.evidence,
                rejectedStrategies: rejected,
                reviewRequired,
                reviewReason: reviewReasons.size > 0
                    ? Array.from(reviewReasons).join("; ")
                    : undefined
            };
        }
        rejected.push({ strategy: SolutionStrategy.CUSTOMIZE, reason: customizeResult.reason });

        // 3. Attempt COMPOSE (Simplified logic for pre-composition phase)
        const composeResult = await this.evaluateCompose(candidates, requirements);
        reviewRequired = reviewRequired || composeResult.reviewRequired;
        if (composeResult.reviewReason) {
            reviewReasons.add(composeResult.reviewReason);
        }

        if (composeResult.success) {
            return {
                strategy: SolutionStrategy.COMPOSE,
                reasoning: composeResult.reason,
                evidence: composeResult.evidence,
                rejectedStrategies: rejected,
                reviewRequired,
                reviewReason: reviewReasons.size > 0
                    ? Array.from(reviewReasons).join("; ")
                    : undefined,
                composition: composeResult.composition ?? null
            };
        }
        rejected.push({ strategy: SolutionStrategy.COMPOSE, reason: composeResult.reason });

        // 4. Fallback to BUILD
        // BUILD is only allowed if we have documented evidence that others failed.
        return {
            strategy: SolutionStrategy.BUILD,
            reasoning: 'No single workflow (Reuse/Customize) or composition was feasible.',
            evidence: `Evidence of failure: ${rejected.map(r => r.reason).join('; ')}`,
            rejectedStrategies: rejected,
            reviewRequired,
            reviewReason: reviewReasons.size > 0
                ? Array.from(reviewReasons).join("; ")
                : undefined,
            // The non-viable plan (if analysis ran) is attached for
            // explainability; BUILD behavior itself is unchanged.
            composition: composeResult.composition ?? null
        };
    }

    private async evaluateReuse(candidates: StrategyCandidate[], requirements: any[]): Promise<{ success: boolean, candidateId?: string, reason: string, evidence: string, reviewRequired: boolean, reviewReason?: string }> {
        const eligibleCandidates: any[] = [];
        let reviewRequired = false;
        const reviewReasons = new Set<string>();

        for (const candidate of candidates) {
            const { isEligible, results } = await this.gateEvaluator.evaluate(
                candidate.matchCandidateId,
                candidate.workflowLibraryId,
                requirements
            );

            for (const result of results) {
                if (result.gateName === 'SECURITY' && result.status === GateStatus.UNKNOWN) {
                    reviewRequired = true;
                    reviewReasons.add(`SECURITY:UNKNOWN (${candidate.workflowLibraryId})`);
                }
            }

            if (!isEligible) {
                continue;
            }

            const coverageFailures = results.filter(
                r => r.gateName === 'MUST_REQUIREMENT_COVERAGE' && r.status !== GateStatus.PASS
            );

            if (coverageFailures.length === 0) {
                eligibleCandidates.push(candidate);
            }
        }

        if (eligibleCandidates.length === 0) {
            return {
                success: false,
                reason: 'No candidate passed all Hard Gates with full MUST coverage.',
                evidence: 'Exhaustive gate check',
                reviewRequired,
                reviewReason: reviewReasons.size > 0 ? Array.from(reviewReasons).join('; ') : undefined
            };
        }

        const ranked = await this.ranker.rank(eligibleCandidates, requirements);
        const best = ranked[0];

        if (!best) {
            return {
                success: false,
                reason: 'Eligible candidates were found, but ranking produced no result.',
                evidence: 'Ranker returned an empty result set.',
                reviewRequired,
                reviewReason: reviewReasons.size > 0 ? Array.from(reviewReasons).join('; ') : undefined
            };
        }

        return {
            success: true,
            candidateId: eligibleCandidates.find(c => c.workflowLibraryId === best.workflowId)?.workflowLibraryId,
            reason: `Candidate passed all Hard Gates and ranked first with score ${best.totalScore.toFixed(3)}.`,
            evidence: best.components
                .map(component => `${component.dimension}: ${component.value.toFixed(3)} ï¿½ ${component.evidence}`)
                .join('; '),
            reviewRequired,
            reviewReason: reviewReasons.size > 0 ? Array.from(reviewReasons).join('; ') : undefined
        };
    }
    private async evaluateCustomize(candidates: StrategyCandidate[], requirements: any[]): Promise<{ success: boolean, candidateId?: string, reason: string, evidence: string, reviewRequired: boolean, reviewReason?: string }> {
        let reviewRequired = false;
        const reviewReasons = new Set<string>();

        for (const candidate of candidates) {
            const { results } = await this.gateEvaluator.evaluate(candidate.matchCandidateId, candidate.workflowLibraryId, requirements);

            for (const result of results) {
                if (result.gateName === 'SECURITY' && result.status === GateStatus.UNKNOWN) {
                    reviewRequired = true;
                    reviewReasons.add(`SECURITY:UNKNOWN (${candidate.workflowLibraryId})`);
                }
            }

            // CUSTOMIZE may tolerate unresolved or incompatible functional details,
            // but trigger, security, and commercial license eligibility are hard blockers.
            const requiredPassGates = [
                'TRIGGER_COMPATIBILITY',
                'SECURITY',
                'LICENSE'
            ];

            const blockingGates = results.filter(r =>
                requiredPassGates.includes(r.gateName) && r.status !== GateStatus.PASS
            );

            if (blockingGates.length === 0) {
                return {
                    success: true,
                    candidateId: candidate.workflowLibraryId,
                    reason: 'Candidate is fundamentally suitable but requires bounded customization.',
                    evidence: 'Critical gates pass, others can be customized.',
                    reviewRequired,
                    reviewReason: reviewReasons.size > 0 ? Array.from(reviewReasons).join('; ') : undefined
                };
            }
        }
        return {
            success: false,
            reason: 'No candidates found with compatible triggers/security for customization.',
            evidence: 'Critical gate check',
            reviewRequired,
            reviewReason: reviewReasons.size > 0 ? Array.from(reviewReasons).join('; ') : undefined
        };
    }

    /**
     * COMPOSE rung (STEP 9): delegates to the injected ComposePlanProvider
     * (production: CompositionPlanner over genuine captured evidence).
     * Without a provider the documented legacy stub behavior is preserved.
     * A viable plan carries its review requirements verbatim — the engine
     * never overrides the planner's compatibility analysis.
     */
    private async evaluateCompose(candidates: any[], requirements: any[]): Promise<{ success: boolean, reason: string, evidence: string, reviewRequired: boolean, reviewReason?: string, composition?: CompositionPlan | null }> {
        if (!this.composePlanProvider) {
            return {
                success: false,
                reason: 'Composition requires the dedicated CompositionEngine; StrategyDecisionEngine does not perform composition using approximate metadata.',
                evidence: 'CompositionEngine is not yet integrated into the production strategy decision path.',
                reviewRequired: false,
                composition: null
            };
        }

        const plan = this.composePlanProvider(candidates, requirements);

        if (!plan) {
            return {
                success: false,
                reason: 'Composition analysis was unavailable for this run.',
                evidence: 'The composition planner returned no plan.',
                reviewRequired: false,
                composition: null
            };
        }

        if (!plan.viable) {
            return {
                success: false,
                reason: plan.reasoning,
                evidence: `Composition plan status: ${plan.status}.`,
                reviewRequired: false,
                composition: plan
            };
        }

        return {
            success: true,
            reason: `Viable composition identified: ${plan.components.length} component(s) collectively cover all MUST requirements.`,
            evidence: plan.reasoning,
            reviewRequired: plan.compatibility.reviewRequired,
            reviewReason: plan.compatibility.reviewRequired
                ? plan.compatibility.concerns.join('; ')
                : undefined,
            composition: plan
        };
    }
}


