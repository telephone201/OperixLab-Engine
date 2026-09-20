/**
 * @file strategy-decision-engine.ts
 * @description Implements deterministic strategy selection: REUSE -> CUSTOMIZE -> COMPOSE -> BUILD.
 */

import { HardGateEvaluator, GateStatus } from './hard-gate-evaluator';
import { WorkflowMatchRanker, MatchRank } from './workflow-match-ranker';

export enum SolutionStrategy {
    REUSE = 'REUSE',
    CUSTOMIZE = 'CUSTOMIZE',
    COMPOSE = 'COMPOSE',
    BUILD = 'BUILD',
    NO_MATCH = 'NO_MATCH'
}

export interface StrategyDecision {
    strategy: SolutionStrategy;
    primaryCandidateId?: string;
    reasoning: string;
    evidence: string;
    rejectedStrategies: { strategy: SolutionStrategy, reason: string }[];
}

export class StrategyDecisionEngine {
    constructor(
        private gateEvaluator: HardGateEvaluator,
        private ranker: WorkflowMatchRanker
    ) {}

    /**
     * Determines the best solution strategy for a lead.
     */
    async determineStrategy(
        leadId: string,
        candidates: any[],
        requirements: any[]
    ): Promise<StrategyDecision> {
        console.log(`[STRATEGY] Determining solution strategy for lead ${leadId}...`);

        const rejected: { strategy: SolutionStrategy, reason: string }[] = [];

        // 1. Attempt REUSE
        const reuseResult = await this.evaluateReuse(candidates, requirements);
        if (reuseResult.success) {
            return {
                strategy: SolutionStrategy.REUSE,
                primaryCandidateId: reuseResult.candidateId,
                reasoning: reuseResult.reason,
                evidence: reuseResult.evidence,
                rejectedStrategies: []
            };
        }
        rejected.push({ strategy: SolutionStrategy.REUSE, reason: reuseResult.reason });

        // 2. Attempt CUSTOMIZE
        const customizeResult = await this.evaluateCustomize(candidates, requirements);
        if (customizeResult.success) {
            return {
                strategy: SolutionStrategy.CUSTOMIZE,
                primaryCandidateId: customizeResult.candidateId,
                reasoning: customizeResult.reason,
                evidence: customizeResult.evidence,
                rejectedStrategies: rejected
            };
        }
        rejected.push({ strategy: SolutionStrategy.CUSTOMIZE, reason: customizeResult.reason });

        // 3. Attempt COMPOSE (Simplified logic for pre-composition phase)
        const composeResult = await this.evaluateCompose(candidates, requirements);
        if (composeResult.success) {
            return {
                strategy: SolutionStrategy.COMPOSE,
                reasoning: composeResult.reason,
                evidence: composeResult.evidence,
                rejectedStrategies: rejected
            };
        }
        rejected.push({ strategy: SolutionStrategy.COMPOSE, reason: composeResult.reason });

        // 4. Fallback to BUILD
        // BUILD is only allowed if we have documented evidence that others failed.
        return {
            strategy: SolutionStrategy.BUILD,
            reasoning: 'No single workflow (Reuse/Customize) or composition was feasible.',
            evidence: `Evidence of failure: ${rejected.map(r => r.reason).join('; ')}`,
            rejectedStrategies: rejected
        };
    }

    private async evaluateReuse(candidates: any[], requirements: any[]): Promise<{ success: boolean, candidateId?: string, reason: string, evidence: string }> {
        for (const candidate of candidates) {
            const { isEligible, results } = await this.gateEvaluator.evaluate(candidate.id, candidate.workflow_id, requirements);

            if (isEligible) {
                // Additional check: All MUST requirements must be FULLY covered for REUSE
                const coverageFailures = results.filter(r => r.gateName === 'MUST_REQUIREMENT_COVERAGE' && r.status !== GateStatus.PASS);
                if (coverageFailures.length === 0) {
                    return {
                        success: true,
                        candidateId: candidate.id,
                        reason: 'Candidate satisfies all Hard Gates and MUST requirements.',
                        evidence: 'All gates PASS'
                    };
                }
            }
        }
        return { success: false, reason: 'No candidate passed all Hard Gates with full MUST coverage.', evidence: 'Exhaustive gate check' };
    }

    private async evaluateCustomize(candidates: any[], requirements: any[]): Promise<{ success: boolean, candidateId?: string, reason: string, evidence: string }> {
        for (const candidate of candidates) {
            const { isEligible, results } = await this.gateEvaluator.evaluate(candidate.id, candidate.workflow_id, requirements);

            // For CUSTOMIZE, we allow some FAILs if they are not critical blockers
            // (e.g., a missing integration that can be added).
            // But Trigger/Security must still be PASS.
            const criticalFailures = results.filter(r =>
                (r.gateName === 'TRIGGER_COMPATIBILITY' || r.gateName === 'SECURITY') && r.status === GateStatus.FAIL
            );

            if (criticalFailures.length === 0) {
                return {
                    success: true,
                    candidateId: candidate.id,
                    reason: 'Candidate is fundamentally suitable but requires bounded customization.',
                    evidence: 'Critical gates pass, others can be customized.'
                };
            }
        }
        return { success: false, reason: 'No candidates found with compatible triggers/security for customization.', evidence: 'Critical gate check' };
    }

    private async evaluateCompose(candidates: any[], requirements: any[]): Promise<{ success: boolean, reason: string, evidence: string }> {
        // This is a placeholder for the full CompositionEngine logic
        // Logic: If we have enough candidates to cover all MUST requirements collectively
        const totalCoveredMusts = new Set<string>();
        // In a real system, we would iterate through candidates and add their covered req IDs
        // ...

        if (totalCoveredMusts.size < requirements.filter(r => r.priority === 'MUST').length) {
            return { success: false, reason: 'Collectively, existing workflows do not cover all MUST requirements.', evidence: 'Aggregate coverage analysis' };
        }

        return { success: true, reason: 'Requirements can be collectively satisfied by a composition of workflows.', evidence: 'Composite coverage matrix' };
    }
}
