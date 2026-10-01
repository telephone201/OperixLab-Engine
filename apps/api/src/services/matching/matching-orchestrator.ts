/**
 * @file matching-orchestrator.ts
 * @description Production orchestration entry point for Workflow Matching.
 *
 * Sequences the approved integration flow after a Requirements analysis has
 * been persisted and REVIEWED. The Requirements transaction has fully
 * committed before this orchestrator runs:
 *
 *   Requirements REVIEWED (committed)
 *     -> Matching Orchestrator (this file â€” never throws)
 *     -> load persisted Requirements state from the DB
 *     -> idempotency: advisory transaction lock on
 *        (leadId + requirementsAnalysisId), existing-session lookup,
 *        FOR UPDATE on the selected session row
 *     -> create/reuse Matching Session (MatchingPersistenceService)
 *     -> WorkflowCandidateSearch (workflow_library discovery)
 *     -> persist candidate rows (MatchingPersistenceService)
 *     -> RequirementCoverageAnalyzer (AUTHORITATIVE producer of `covered`)
 *     -> HardGateEvaluator (existing gates â€” unchanged)
 *     -> WorkflowMatchRanker (existing weights â€” unchanged)
 *     -> StrategyDecisionEngine (REUSE -> CUSTOMIZE -> COMPOSE -> BUILD â€” unchanged)
 *     -> MatchingPersistenceService.persistDecision: session status/strategy,
 *        candidate scores/statuses, requirement coverage evidence and the
 *        solution_architectures draft persisted in ONE atomic transaction
 *
 * APPROVED ARCHITECTURAL DECISIONS IMPLEMENTED HERE:
 *
 * 1. MUST coverage: RequirementCoverageAnalyzer is the authoritative producer
 *    of the `covered` flag. The caller never invents or overrides `covered`;
 *    it is derived exclusively from the analyzer output (FULL = covered) and
 *    attached to requirement copies before gate evaluation. PARTIAL, NONE and
 *    UNKNOWN leave a MUST requirement uncovered (hard-gate semantics).
 *
 * 2. Idempotency: the matching identity is (leadId + requirementsAnalysisId).
 *    Re-running matching for the same identity returns/reuses the existing
 *    matching session instead of creating duplicates. Enforced at application
 *    level with pg_advisory_xact_lock + existing-session lookup + FOR UPDATE.
 *    No migration and no unique constraint are involved. An interrupted run
 *    leaves the session in ANALYZING; re-running returns that existing
 *    session (no duplicates). Resuming an interrupted session is out of
 *    scope for this step.
 *
 * FAILURE BEHAVIOR (mirrors lead-lifecycle-orchestrator.ts): matching errors
 * are caught, audit-logged and returned as a typed FAILED outcome. Matching
 * never throws to the Requirements persistence flow and never rolls it back.
 */

import type { PoolClient } from 'pg';

import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';
import { matchingPersistenceService } from './matching-persistence-service';
import type {
    MatchingSessionRecord,
    MatchingCandidateRecord
} from './matching-persistence-service';
import { WorkflowCandidateSearch } from './workflow-candidate-search';
import type { Candidate as WorkflowLibraryCandidate } from './workflow-candidate-search';
import { RequirementCoverageAnalyzer } from './requirement-coverage-analyzer';
import { CoverageLevel } from './requirement-coverage-analyzer';
import type { CoverageResult } from './requirement-coverage-analyzer';
import { HardGateEvaluator } from './hard-gate-evaluator';
import { compositionPlanner } from './composition-planner';
import type { CompositionPlanInput, CompositionGateOutcome, CompositionPlan } from './composition-planner';
import { WorkflowMatchRanker } from './workflow-match-ranker';
import { StrategyDecisionEngine } from './strategy-decision-engine';
import type { StrategyCandidate } from './strategy-decision-engine';

/** Prefix for the advisory lock key of the matching identity. */
const MATCHING_IDENTITY_LOCK_PREFIX = 'matching';

/** Session status values relevant to this orchestrator (migration 008 lifecycle). */
const MATCHING_SESSION_STATUS = {
    ANALYZING: 'ANALYZING',
    MATCHED: 'MATCHED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED'
} as const;

/**
 * Shape of a persisted requirements row (migration 007) as consumed by the
 * existing matching engines. The engines read snake_case fields
 * (trigger_definition, input_definition, output_definition,
 * integration_requirements) directly off these row objects.
 */
interface MatchableRequirement {
    id: string;
    priority: string;
    title: string;
    description: string;
    category?: string | null;
    trigger_definition?: string | null;
    input_definition?: any;
    output_definition?: any;
    integration_requirements?: any;
}

/**
 * WorkflowCandidateSearch row enriched with fields that exist on the actual
 * workflow_library DB row (SELECT *) but are absent from the class's TS
 * interface â€” notably `description`, which RequirementCoverageAnalyzer
 * dereferences in its keyword fallback.
 */
type LibraryCandidateRow = WorkflowLibraryCandidate & {
    description?: string | null;
};

export interface MatchingOutcomeCandidate {
    /** workflow_match_candidates.id */
    candidateId: string;
    /** workflow_library.id (FK stored in workflow_match_candidates.workflow_id) */
    workflowLibraryId: string;
    matchScore: number | null;
    rank: number | null;
    status: string;
    reasoning: string | null;
}

export interface MatchingOutcome {
    matchingSessionId: string;
    leadId: string;
    requirementsAnalysisId: string;
    /** true when an existing session was returned instead of creating a new one */
    reused: boolean;
    /** workflow_match_sessions.status (ANALYZING | MATCHED | REVIEW_REQUIRED) */
    status: string;
    strategy?: string;
    overallConfidence?: number | null;
    primaryCandidateId?: string | null;
    reasoning?: string;
    candidates: MatchingOutcomeCandidate[];
}

export type MatchingOrchestrationOutcome =
    | { status: 'COMPLETED'; matching: MatchingOutcome }
    | { status: 'REUSED'; matching: MatchingOutcome }
    | { status: 'SKIPPED'; reason: string }
    | { status: 'FAILED'; error: string };

/** Result of the idempotency transaction for the matching identity. */
interface SessionIdentityOutcome {
    existingRow: Record<string, any> | null;
    createdSession: MatchingSessionRecord | null;
}

interface MatchingRunContext {
    ranks: Map<string, { totalScore: number; rank: number }>;
    eligibleByLibraryId: Map<string, boolean>;
    failedGatesByLibraryId: Map<string, string | null>;
    gateOutcomesByLibraryId: Map<string, { fail: string[]; unknown: string[] }>;
    coverageByLibraryId: Map<string, CoverageResult[]>;
}

/**
 * WorkflowMatchRanker adapter that delegates to the real ranker unchanged and
 * captures its genuine output (MatchRank list) for atomic persistence. Same
 * structural-cast rationale as the gate adapter below: the strategy engine
 * owns the rank() call, so capture happens by delegation.
 */
class MatchingRanker {
    /** workflow_library.id (PK) -> genuine ranker output for the current run. */
    private readonly realRanker = new WorkflowMatchRanker();

    async rank(candidates: any[], requirements: any[]) {
        return this.realRanker.rank(candidates, requirements);
    }
    }

export class MatchingOrchestrator {
    private readonly candidateSearch = new WorkflowCandidateSearch();
    private readonly coverageAnalyzer = new RequirementCoverageAnalyzer();
    private readonly gateEvaluator = new HardGateEvaluator();
    private readonly rankerCapture = new MatchingRanker();

    /**
     * Runs the matching flow for a lead whose Requirements analysis has been
     * persisted and REVIEWED. Never throws.
     */
    async onRequirementsReviewed(input: {
        leadId: string;
        requirementsAnalysisId: string;
    }): Promise<MatchingOrchestrationOutcome> {
        const leadId = String(input?.leadId ?? '').trim();
        const requirementsAnalysisId = String(input?.requirementsAnalysisId ?? '').trim();

        try {
            if (!leadId || !requirementsAnalysisId) {
                return { status: 'SKIPPED', reason: 'MATCHING_IDENTITY_REQUIRED' };
            }

            // A. Load persisted Requirements state (never caller-supplied).
            // B. Ownership check: the analysis must belong to leadId.
            const loaded = await this.loadPersistedRequirements(
                leadId,
                requirementsAnalysisId
            );

            if (!loaded) {
                return {
                    status: 'SKIPPED',
                    reason: 'MATCHING_REQUIREMENTS_ANALYSIS_NOT_FOUND_FOR_LEAD'
                };
            }

            const { analysis, requirements } = loaded;

            // C. The analysis must be valid/complete for matching.
            const invalidReason = this.validateAnalysisForMatching(
                analysis,
                requirements
            );

            if (invalidReason) {
                return { status: 'SKIPPED', reason: invalidReason };
            }

            const runContext: MatchingRunContext = { ranks: new Map(), eligibleByLibraryId: new Map(), failedGatesByLibraryId: new Map(), gateOutcomesByLibraryId: new Map(), coverageByLibraryId: new Map() };
            // D. Idempotency: advisory transaction lock on the matching
            // identity, then an existing-session lookup with FOR UPDATE.
            // E. Reuse an existing session instead of creating duplicates.
            // F. Otherwise create the session while the identity lock is
            // still held, so concurrent runs observe the committed session
            // as soon as the lock is released.
            const identity = await db.transaction(
                async (client): Promise<SessionIdentityOutcome> => {
                    await this.acquireMatchingIdentityLock(
                        client,
                        leadId,
                        requirementsAnalysisId
                    );

                    const existingRow = await this.findExistingSessionRow(
                        client,
                        leadId,
                        requirementsAnalysisId
                    );

                    if (existingRow) {
                        return { existingRow, createdSession: null };
                    }

                    // F. Create the session while the identity lock is still
                    // held: concurrent runs for the same identity serialize
                    // here and observe the committed session as soon as the
                    // transaction-scoped lock is released.
                    const createdSession =
                        await matchingPersistenceService.createSession(
                            leadId,
                            requirementsAnalysisId
                        );

                    return { existingRow: null, createdSession };
                }
            );

            // E. Reuse the existing session instead of creating duplicates.
            if (identity.existingRow) {
                return await this.reuseExistingSession(
                    identity.existingRow,
                    leadId,
                    requirementsAnalysisId
                );
            }

            if (!identity.createdSession) {
                return {
                    status: 'FAILED',
                    error: 'MATCHING_SESSION_CREATION_FAILED'
                };
            }

            const session: MatchingSessionRecord = identity.createdSession;

            await auditLogger.log({
                action: 'MATCHING_SESSION_CREATED',
                entityType: 'WorkflowMatchSession',
                entityId: session.id,
                details: { leadId, requirementsAnalysisId }
            });

            // G. Candidate discovery from the workflow library. The search
            // is read-only and does not hit workflow_match_* tables.
            const libraryCandidates = (await this.candidateSearch.search({
                requirements
            })) as LibraryCandidateRow[];

            if (libraryCandidates.length === 0) {
                // No indexed workflow can even be considered. Record a
                // terminal review state â€” no fake candidates, no fake
                // decision. Session-level reasoning has no column; the audit
                // log is the evidence trail.
                await db.workflow_match_sessions.update({
                    where: { id: session.id },
                    data: {
                        status: MATCHING_SESSION_STATUS.REVIEW_REQUIRED,
                        updated_at: new Date()
                    }
                });

                await auditLogger.log({
                    action: 'MATCHING_NO_CANDIDATES',
                    entityType: 'WorkflowMatchSession',
                    entityId: session.id,
                    details: { leadId, requirementsAnalysisId }
                });

                return {
                    status: 'COMPLETED',
                    matching: {
                        matchingSessionId: session.id,
                        leadId,
                        requirementsAnalysisId,
                        reused: false,
                        status: MATCHING_SESSION_STATUS.REVIEW_REQUIRED,
                        candidates: []
                    }
                };
            }

            // H. Persist candidate rows and adapt the shapes for the
            // existing engines (StrategyCandidate + ranker/analyzer fields).
            const libraryById = new Map(
                libraryCandidates.map((candidate) => [candidate.id, candidate])
            );

            const candidateRecords =
                await matchingPersistenceService.createCandidates(
                    session.id,
                    libraryCandidates.map((candidate) => ({
                        workflowLibraryId: candidate.id
                    }))
                );

            // I/J/K. Coverage-aware gate evaluation -> ranking -> strategy
            // I/J/K. Coverage-aware gate evaluation, ranking and strategy decision.
            const strategyCandidates = this.buildStrategyCandidates(
                candidateRecords,
                libraryById
            );
            const runRanker = { rank: async (candidates: any[], runRequirements: any[]) => { const ranks = await this.rankerCapture.rank(candidates, runRequirements); runContext.ranks.clear(); for (const item of ranks) { runContext.ranks.set(String(item.workflowId), { totalScore: item.totalScore, rank: item.rank }); } return ranks; } };
            const strategyEngine = new StrategyDecisionEngine(
                this.buildCoverageAwareGateEvaluator(libraryById, runContext),
                runRanker as unknown as WorkflowMatchRanker,
                (candidates, runRequirements) =>
                    this.buildComposePlan(candidates, runRequirements, libraryById, runContext)
            );

            const decision = await strategyEngine.determineStrategy(
                leadId,
                strategyCandidates,
                requirements
            );

            // STEP 4: atomic persistence of the already-produced decision and
            // evidence â€” session transition + candidate scores/statuses +
            // coverage evidence + solution architecture draft â€” in ONE
            // transaction. The former inline decision update was replaced by
            // this single transactional call (no partial state possible).
            const persisted = await matchingPersistenceService.persistDecision({
                sessionId: session.id,
                leadId,
                strategy: decision.strategy,
                reasoning: decision.reasoning,
                evidence: decision.evidence,
                rejectedStrategies: decision.rejectedStrategies,
                reviewRequired: decision.reviewRequired,
                reviewReason: decision.reviewReason,
                primaryCandidateLibraryId: decision.primaryCandidateId ?? null,
                candidates: strategyCandidates.map((candidate) => {
                    const gates = runContext.eligibleByLibraryId.get(
                        candidate.workflowLibraryId
                    );

                    return {
                        candidateRowId: candidate.matchCandidateId,
                        workflowLibraryId: candidate.workflowLibraryId,
                        eligible: gates === undefined ? null : gates,
                        failedGates:
                            runContext.failedGatesByLibraryId.get(
                                candidate.workflowLibraryId
                            ) ?? null
                    };
                }),
                scoresByLibraryId: runContext.ranks,
                coverageByLibraryId: runContext.coverageByLibraryId,
                composition: decision.composition ?? null,
                requirements: requirements.map((requirement) => ({
                    id: requirement.id,
                    priority: requirement.priority
                }))
            });

            const sessionStatus = persisted.sessionStatus;

            await auditLogger.log({
                action: 'MATCHING_DECISION_REACHED',
                entityType: 'WorkflowMatchSession',
                entityId: session.id,
                details: {
                    leadId,
                    requirementsAnalysisId,
                    strategy: decision.strategy,
                    primaryCandidateId: decision.primaryCandidateId ?? null,
                    candidateCount: candidateRecords.length,
                    solutionArchitectureId: persisted.solutionArchitectureId
                }
            });

            return {
                status: 'COMPLETED',
                matching: {
                    matchingSessionId: session.id,
                    leadId,
                    requirementsAnalysisId,
                    reused: false,
                    status: sessionStatus,
                    strategy: decision.strategy,
                    primaryCandidateId: decision.primaryCandidateId ?? null,
                    reasoning: decision.reasoning,
                    candidates: candidateRecords.map((record) => {
                        const persistedCandidate =
                            persisted.candidateStatuses.find(
                                (item) => item.candidateRowId === record.id
                            );

                        return {
                            candidateId: record.id,
                            workflowLibraryId: record.workflowLibraryId,
                            matchScore: persistedCandidate?.matchScore ?? null,
                            rank: persistedCandidate?.rank ?? null,
                            status: persistedCandidate?.status ?? 'CANDIDATE',
                            reasoning: null
                        };
                    })
                }
            };
        } catch (error: any) {
            // M/N. Matching errors are audit-logged and returned as a typed
            // outcome. They never propagate to the Requirements flow.
            await auditLogger.log({
                action: 'MATCHING_TRIGGER_FAILED',
                entityType: 'WorkflowMatching',
                entityId: leadId,
                details: {
                    requirementsAnalysisId,
                    error: error?.message ?? String(error)
                }
            });

            return {
                status: 'FAILED',
                error: error?.message ?? 'MATCHING_FAILED'
            };
        }
    }

    // ------------------------------------------------------------------
    // Requirements input (persisted state only)
    // ------------------------------------------------------------------

    private async loadPersistedRequirements(
        leadId: string,
        requirementsAnalysisId: string
    ): Promise<{
        analysis: Record<string, any>;
        requirements: MatchableRequirement[];
    } | null> {
        const analysisRow = await db.requirements_analyses.findUnique({
            where: { id: requirementsAnalysisId }
        });

        if (!analysisRow || analysisRow.lead_id !== leadId) {
            return null;
        }

        const requirementRows = await db.requirements.findMany({
            where: { analysis_id: requirementsAnalysisId },
            orderBy: [{ created_at: 'asc' }]
        });

        return {
            analysis: analysisRow,
            requirements: requirementRows as MatchableRequirement[]
        };
    }

    /**
     * Validity for matching. The real completeness proof is the presence of
     * persisted requirement rows (inserted in the same transaction as the
     * analysis). Statuses that explicitly exclude matching are rejected;
     * RequirementStatus values written by the version manager
     * (CANDIDATE/VALIDATED/APPROVED) and REVIEW_REQUIRED are matchable.
     */
    private validateAnalysisForMatching(
        analysis: Record<string, any>,
        requirements: MatchableRequirement[]
    ): string | null {
        if (!Array.isArray(requirements) || requirements.length === 0) {
            return 'MATCHING_NO_PERSISTED_REQUIREMENTS';
        }

        const status = String(analysis.status ?? '').trim().toUpperCase();
        const blockedStatuses = new Set(['DRAFT', 'REJECTED', 'SUPERSEDED']);

        if (status && blockedStatuses.has(status)) {
            return `MATCHING_REQUIREMENTS_STATUS_NOT_MATCHABLE:${status}`;
        }

        return null;
    }

    // ------------------------------------------------------------------
    // Idempotency (leadId + requirementsAnalysisId)
    // ------------------------------------------------------------------

    private async acquireMatchingIdentityLock(
        client: PoolClient,
        leadId: string,
        requirementsAnalysisId: string
    ): Promise<void> {
        // Project convention: SELECT pg_advisory_xact_lock(hashtext($1)).
        // Transaction-scoped: released automatically when this transaction
        // ends (after the session has been created and committed).
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `${MATCHING_IDENTITY_LOCK_PREFIX}:${leadId}:${requirementsAnalysisId}`
        ]);
    }

    private async findExistingSessionRow(
        client: PoolClient,
        leadId: string,
        requirementsAnalysisId: string
    ): Promise<Record<string, any> | null> {
        const result = await client.query(
            `SELECT *
             FROM "workflow_match_sessions"
             WHERE "lead_id" = $1 AND "requirements_version_id" = $2
             ORDER BY "created_at" DESC
             LIMIT 1
             FOR UPDATE`,
            [leadId, requirementsAnalysisId]
        );

        return result.rows[0] ?? null;
    }

    private async reuseExistingSession(
        sessionRow: Record<string, any>,
        leadId: string,
        requirementsAnalysisId: string
    ): Promise<MatchingOrchestrationOutcome> {
        const storedCandidateRows = await db.workflow_match_candidates.findMany({
            where: { session_id: sessionRow.id },
            orderBy: [{ rank: 'asc' }]
        });

        await auditLogger.log({
            action: 'MATCHING_SESSION_REUSED',
            entityType: 'WorkflowMatchSession',
            entityId: sessionRow.id,
            details: { leadId, requirementsAnalysisId }
        });

        return {
            status: 'REUSED',
            matching: {
                matchingSessionId: sessionRow.id,
                leadId,
                requirementsAnalysisId,
                reused: true,
                status: sessionRow.status ?? MATCHING_SESSION_STATUS.ANALYZING,
                strategy: sessionRow.strategy ?? undefined,
                overallConfidence: sessionRow.overall_confidence ?? null,
                candidates: storedCandidateRows.map((row: Record<string, any>) => ({
                    candidateId: row.id,
                    workflowLibraryId: row.workflow_id,
                    matchScore: row.match_score ?? null,
                    rank: row.rank ?? null,
                    status: row.status ?? 'CANDIDATE',
                    reasoning: row.reasoning ?? null
                }))
            }
        };
    }

    // ------------------------------------------------------------------
    // Candidate adaptation (no engine modifications)
    // ------------------------------------------------------------------

    /**
     * Maps persisted candidate rows to StrategyCandidate and enriches them
     * with the workflow_library fields the existing engines read: `id` and
     * `quality_score` (WorkflowMatchRanker), `workflow_id` (linkage protocol,
     * see below) and the metadata RequirementCoverageAnalyzer consumes
     * (`integrations`, `triggers`, `description`, `name`, `category`).
     *
     * Linkage protocol: WorkflowMatchRanker.rank() copies candidate.workflow_id
     * into MatchRank.workflowId, and StrategyDecisionEngine.evaluateReuse()
     * resolves the ranked winner via eligibleCandidates.find(c =>
     * c.workflowLibraryId === best.workflowId). The workflow_library PK UUID
     * must therefore be exposed as workflow_id on the candidate â€” exposing
     * the business slug there silently breaks primaryCandidateId on REUSE.
     * The original business workflow ID is preserved under the
     * non-conflicting `libraryWorkflowId` field. The coverage analyzer is
     * fed the library row separately and never reads strategy candidates.
     * Attaching these fields to the candidate object adapts the
     * search/strategy shapes without modifying the engines.
     */
    private buildStrategyCandidates(
        records: MatchingCandidateRecord[],
        libraryById: Map<string, LibraryCandidateRow>
    ): StrategyCandidate[] {
        return records.map((record) => {
            const library = libraryById.get(record.workflowLibraryId);

            const strategyCandidate: StrategyCandidate = {
                workflowLibraryId: record.workflowLibraryId,
                matchCandidateId: record.id
            };

            if (!library) {
                return strategyCandidate;
            }

            return Object.assign(strategyCandidate, {
                id: library.id,
                // Linkage protocol field (see JSDoc above): must be the
                // workflow_library PK so evaluateReuse() can resolve
                // best.workflowId back to this candidate.
                workflow_id: record.workflowLibraryId,
                // Original business workflow ID (slug), preserved under a
                // non-conflicting name for evidence fidelity.
                libraryWorkflowId: library.workflow_id,
                name: library.name,
                category: library.category,
                integrations: library.integrations,
                triggers: library.triggers,
                quality_score: library.quality_score
            });
        });
    }

    // ------------------------------------------------------------------
    // Coverage-aware hard gates (approved decision #1)
    // ------------------------------------------------------------------

    /**
     * Builds the gate evaluator handed to StrategyDecisionEngine. The
     * adapter computes requirement coverage with RequirementCoverageAnalyzer
     * (the authoritative producer of `covered`), attaches the flag to
     * requirement copies, captures the genuine gate verdict and coverage
     * output for atomic persistence, and delegates to the real
     * HardGateEvaluator with its exact original contract â€” the engines
     * themselves are untouched.
     */
    private buildCoverageAwareGateEvaluator(
        libraryById: Map<string, LibraryCandidateRow>,
        runContext: MatchingRunContext
    ): HardGateEvaluator {
        const evaluate = async (
            candidateId: string,
            workflowId: string,
            requirements: any[]
        ) => {
            const libraryCandidate = libraryById.get(workflowId);

            let requirementsWithCoverage = requirements;

            if (libraryCandidate) {
                const coverage = await this.coverageAnalyzer.analyzeCoverage(
                    this.normalizeLibraryCandidate(libraryCandidate),
                    requirements
                );

                // Capture the genuine analyzer output for atomic persistence.
                runContext.coverageByLibraryId.set(workflowId, coverage);

                requirementsWithCoverage = this.annotateRequirementsWithCoverage(
                    requirements,
                    coverage
                );
            }

            const gateOutcome = await this.gateEvaluator.evaluate(
                candidateId,
                workflowId,
                requirementsWithCoverage
            );

            // Capture the genuine gate verdict for atomic persistence.
            runContext.eligibleByLibraryId.set(workflowId, gateOutcome.isEligible);

            runContext.failedGatesByLibraryId.set(
                workflowId,
                gateOutcome.results
                    .filter((result) => result.status !== 'PASS')
                    .map((result) => `${result.gateName}:${result.status}`)
                    .join('; ') || null
            );

            // Capture per-gate statuses for the composition planner (genuine
            // evaluator output; FAIL/UNKNOWN name lists, deterministic order
            // is enforced downstream by the planner).
            runContext.gateOutcomesByLibraryId.set(workflowId, {
                fail: gateOutcome.results
                    .filter((result) => result.status === 'FAIL')
                    .map((result) => result.gateName)
                    .sort(),
                unknown: gateOutcome.results
                    .filter((result) => result.status === 'UNKNOWN')
                    .map((result) => result.gateName)
                    .sort()
            });

            return gateOutcome;
        };

        // Structural cast: StrategyDecisionEngine declares its dependency as
        // HardGateEvaluator (a class with private members), so a plain
        // adapter object is not assignable without a cast. The adapter
        // preserves the exact evaluate() contract and delegates to the real
        // evaluator; no engine logic is modified.
        return { evaluate } as unknown as HardGateEvaluator;
    }

    /**
     * Builds the CompositionPlan input from THIS run's genuine captured
     * evidence (coverage maps are filled by the coverage-aware gate adapter
     * during the REUSE/CUSTOMIZE rungs; gate outcomes likewise). Returns
     * null when no candidate evidence was captured (composition analysis
     * unavailable — legacy stub behavior applies).
     */
    private buildComposePlan(
        candidates: StrategyCandidate[],
        requirements: any[],
        libraryById: Map<string, LibraryCandidateRow>,
        runContext: MatchingRunContext
    ): CompositionPlan | null {
        if (runContext.coverageByLibraryId.size === 0 || runContext.eligibleByLibraryId.size === 0) {
            return null;
        }

        const plannerCandidates: CompositionPlanInput['candidates'] = [];
        const gatesByLibraryId = new Map<string, CompositionGateOutcome>();

        for (const candidate of candidates) {
            const library = libraryById.get(candidate.workflowLibraryId);
            const gateOutcomes = runContext.gateOutcomesByLibraryId.get(candidate.workflowLibraryId);

            if (!library || !gateOutcomes) {
                continue;
            }

            plannerCandidates.push({
                workflowLibraryId: candidate.workflowLibraryId,
                name: library.name ?? null,
                integrations: this.normalizeLibraryCandidate(library).integrations,
                triggers: this.normalizeLibraryCandidate(library).triggers
            });
            gatesByLibraryId.set(candidate.workflowLibraryId, {
                gateNamesByStatus: gateOutcomes
            });
        }

        if (plannerCandidates.length === 0) {
            return null;
        }

        const planInput: CompositionPlanInput = {
            requirements: requirements.map((requirement) => ({
                id: requirement.id,
                priority: requirement.priority ?? null
            })),
            candidates: plannerCandidates,
            coverageByLibraryId: runContext.coverageByLibraryId,
            gatesByLibraryId
        };

        return compositionPlanner.plan(planInput);
    }

    /**
     * Normalizes nullable library fields the coverage analyzer dereferences,
     * and adapts workflow_library storage shapes to the array shapes
     * RequirementCoverageAnalyzer consumes: `integrations` is a
     * comma-separated TEXT column parsed with the same split/trim/filter
     * semantics as the db.buildWhere hasSome operator (case is preserved —
     * the analyzer compares integration names case-sensitively), and
     * `triggers` is JSONB that pg already delivers as an array (a JSON or
     * scalar string is safely unwrapped). Values that are already arrays
     * pass through untouched; no trigger/integration values are invented.
     */
    private normalizeLibraryCandidate(candidate: LibraryCandidateRow) {
        return {
            ...candidate,
            description: candidate.description ?? '',
            integrations: Array.isArray(candidate.integrations)
                ? candidate.integrations
                : String(candidate.integrations ?? '')
                    .split(',')
                    .map((value: string) => value.trim())
                    .filter((value: string) => value.length > 0),
            triggers: Array.isArray(candidate.triggers)
                ? candidate.triggers
                : this.parseTriggerValue(candidate.triggers)
        };
    }

    /**
     * Safely unwraps a non-array JSONB trigger value into the string[] the
     * coverage analyzer expects: a JSON array string is parsed, a JSON/scalar
     * string becomes a single-element array, and anything else that cannot
     * name a trigger yields an empty array.
     */
    private parseTriggerValue(value: unknown): string[] {
        if (typeof value !== 'string') {
            return [];
        }

        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return [];
        }

        try {
            const parsed: unknown = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
                return parsed
                    .map((item) => String(item).trim())
                    .filter((item) => item.length > 0);
            }

            if (typeof parsed === 'string' && parsed.trim().length > 0) {
                return [parsed.trim()];
            }
        } catch {
            // Not JSON: treat the raw text as a single trigger name.
        }

        return [trimmed];
    }

    /**
     * Returns requirement COPIES annotated with `covered` derived exclusively
     * from RequirementCoverageAnalyzer output. The original persisted rows
     * are never mutated and the flag is never invented or overridden.
     */
    private annotateRequirementsWithCoverage(
        requirements: MatchableRequirement[],
        coverage: CoverageResult[]
    ): any[] {
        const coverageByRequirementId = new Map(
            coverage.map((result) => [result.requirementId, result])
        );

        return requirements.map((requirement) => ({
            ...requirement,
            covered: this.isRequirementCovered(
                coverageByRequirementId.get(requirement.id)
            )
        }));
    }

    /**
     * Hard-gate semantics: only FULL coverage satisfies a MUST requirement
     * as-is; PARTIAL, NONE and UNKNOWN leave the requirement uncovered
     * (which drives the CUSTOMIZE/BUILD ladder in the decision engine).
     */
    private isRequirementCovered(result?: CoverageResult): boolean {
        return !!result && result.level === CoverageLevel.FULL;
    }
}

export const matchingOrchestrator = new MatchingOrchestrator();




