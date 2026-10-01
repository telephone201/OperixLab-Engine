import crypto from 'crypto';
import { db } from '../../lib/db';
import type { CoverageResult } from './requirement-coverage-analyzer';
import type { CompositionPlan } from './composition-planner';

export interface MatchingSessionRecord {
    id: string;
    leadId: string;
    requirementsVersionId: string;
}

export interface MatchingCandidateInput {
    workflowLibraryId: string;
    matchScore?: number | null;
    rank?: number | null;
    status?: string;
    reasoning?: string | null;
}

export interface MatchingCandidateRecord {
    id: string;
    sessionId: string;
    workflowLibraryId: string;
}

/** One persisted candidate input for the atomic decision persistence. */
export interface PersistDecisionCandidateInput {
    /** workflow_match_candidates.id */
    candidateRowId: string;
    /** workflow_library.id */
    workflowLibraryId: string;
    /** Genuine gate verdict (null = gates never evaluated for this candidate). */
    eligible: boolean | null;
    /** Genuine failed-gate summary captured from HardGateEvaluator results. */
    failedGates: string | null;
}

export interface PersistDecisionInput {
    sessionId: string;
    leadId: string;
    strategy: string;
    reasoning: string;
    evidence: string;
    rejectedStrategies: { strategy: string; reason: string }[];
    reviewRequired?: boolean;
    reviewReason?: string;
    /** workflow_library.id of the primary candidate (REUSE/CUSTOMIZE only). */
    primaryCandidateLibraryId: string | null;
    candidates: PersistDecisionCandidateInput[];
    /** Genuine WorkflowMatchRanker output keyed by workflow_library.id. */
    scoresByLibraryId: Map<string, { totalScore: number; rank: number }>;
    /** Production composition analysis (STEP 9); null when strategy != COMPOSE-related. */
    composition?: CompositionPlan | null;
    /** Genuine RequirementCoverageAnalyzer output keyed by workflow_library.id. */
    coverageByLibraryId: Map<string, CoverageResult[]>;
    /** Persisted requirement identities (id + priority) for is_must_requirement. */
    requirements: { id: string; priority: string }[];
}

export interface PersistDecisionCandidateStatus {
    candidateRowId: string;
    status: string;
    matchScore: number | null;
    rank: number | null;
}

export interface PersistDecisionResult {
    solutionArchitectureId: string | null;
    alreadyPersisted: boolean;
    sessionStatus: string;
    candidateStatuses: PersistDecisionCandidateStatus[];
}

export class MatchingPersistenceService {
    async createSession(
        leadId: string,
        requirementsVersionId: string
    ): Promise<MatchingSessionRecord> {
        const sessionId = crypto.randomUUID();

        await db.transaction(async (client) => {
            await client.query(
                `
                INSERT INTO "workflow_match_sessions" (
                    "id",
                    "lead_id",
                    "requirements_version_id",
                    "status",
                    "created_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                `,
                [
                    sessionId,
                    leadId,
                    requirementsVersionId,
                    'ANALYZING'
                ]
            );
        });

        return {
            id: sessionId,
            leadId,
            requirementsVersionId
        };
    }

    async createCandidates(
        sessionId: string,
        candidates: MatchingCandidateInput[]
    ): Promise<MatchingCandidateRecord[]> {
        return db.transaction(async (client) => {
            const records: MatchingCandidateRecord[] = [];

            for (const candidate of candidates) {
                const candidateId = crypto.randomUUID();

                await client.query(
                    `
                    INSERT INTO "workflow_match_candidates" (
                        "id",
                        "session_id",
                        "workflow_id",
                        "match_score",
                        "rank",
                        "status",
                        "reasoning",
                        "created_at"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    `,
                    [
                        candidateId,
                        sessionId,
                        candidate.workflowLibraryId,
                        candidate.matchScore ?? null,
                        candidate.rank ?? null,
                        candidate.status ?? 'CANDIDATE',
                        candidate.reasoning ?? null
                    ]
                );

                records.push({
                    id: candidateId,
                    sessionId,
                    workflowLibraryId: candidate.workflowLibraryId
                });
            }

            return records;
        });
    }

    /**
     * Persists the already-produced matching decision and its evidence as ONE
     * atomic unit (single db.transaction):
     *   session strategy/status transition
     *   + candidate scores/ranks/statuses (in-place update)
     *   + requirement coverage rows (workflow_requirement_matches)
     *   + solution_architectures draft (existing initial DRAFT state)
     *
     * solution_versions is intentionally NOT written: its actual FK
     * (solution_versions_solution_id_fkey, migration 001) targets the legacy
     * solutions table, not solution_architectures — the 008 reconciliation
     * added columns but never retargeted the FK. Persisting a version row
     * against solution_architectures.id violates that constraint (verified
     * at runtime); writing legacy solutions rows would invent data in an
     * unrelated pipeline. The table therefore keeps its pre-STEP-4 state
     * (no production writer).
     *
     * Schema contract (migrations 001/008 — no migration created, no columns
     * added): workflow_match_sessions.status/strategy; workflow_match_candidates
     * match_score/rank/status/reasoning (008 documents CANDIDATE,
     * DISQUALIFIED, SELECTED, and the hard-gate evaluator documents that a
     * gate FAIL "disqualifies a candidate from REUSE");
     * workflow_requirement_matches candidate_id/requirement_id/coverage_level/
     * evidence/confidence/is_must_requirement; solution_architectures
     * (session_id, lead_id, strategy, blueprint JSONB, version default 1,
     * status default 'DRAFT'); solution_versions (solution_id, version,
     * config_snapshot, changelog).
     *
     * Idempotency: a session-keyed advisory transaction lock serializes
     * concurrent persistence; an existing solution_architectures row for the
     * session short-circuits to the already-persisted result (the atomic
     * transaction guarantees no partial state can exist). Repeated invocation
     * is safe by construction: candidate rows are updated in place and
     * coverage rows are rewritten for the session.
     *
     * overall_confidence stays NULL: StrategyDecision carries no numeric
     * confidence and none is invented.
     */
    async persistDecision(
        input: PersistDecisionInput
    ): Promise<PersistDecisionResult> {
        return db.transaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `matching-session:${input.sessionId}`
            ]);

            // Idempotency guard: the decision for this session was already
            // persisted — return the existing persisted state unchanged.
            const existingArchitecture = await client.query(
                `SELECT "id" FROM "solution_architectures"
                 WHERE "session_id" = $1
                 LIMIT 1`,
                [input.sessionId]
            );

            if (existingArchitecture.rows[0]) {
                const sessionRow = await client.query(
                    `SELECT "status" FROM "workflow_match_sessions"
                     WHERE "id" = $1`,
                    [input.sessionId]
                );

                const candidateRows = await client.query(
                    `SELECT "id", "match_score", "rank", "status"
                     FROM "workflow_match_candidates"
                     WHERE "session_id" = $1`,
                    [input.sessionId]
                );

                return {
                    solutionArchitectureId: String(existingArchitecture.rows[0].id),
                    alreadyPersisted: true,
                    sessionStatus: sessionRow.rows[0]?.status ?? 'ANALYZING',
                    candidateStatuses: candidateRows.rows.map((row: any) => ({
                        candidateRowId: String(row.id),
                        status: String(row.status ?? 'CANDIDATE'),
                        matchScore: row.match_score == null ? null : Number(row.match_score),
                        rank: row.rank == null ? null : Number(row.rank)
                    }))
                };
            }

            // 1. Unified session decision/state transition (migration 008
            // lifecycle: BUILD/NO_MATCH require human review, otherwise the
            // session is MATCHED).
            const sessionStatus =
                input.reviewRequired ||
                input.strategy === 'BUILD' ||
                input.strategy === 'NO_MATCH'
                    ? 'REVIEW_REQUIRED'
                    : 'MATCHED';

            await client.query(
                `UPDATE "workflow_match_sessions"
                 SET "status" = $2, "strategy" = $3, "updated_at" = NOW()
                 WHERE "id" = $1`,
                [input.sessionId, sessionStatus, input.strategy]
            );

            const mustByRequirementId = new Set(
                input.requirements
                    .filter((requirement) => requirement.priority === 'MUST')
                    .map((requirement) => requirement.id)
            );

            // Coverage rows are rewritten for the session so repeat runs stay
            // clean (no unique constraint exists on these tables).
            await client.query(
                `DELETE FROM "workflow_requirement_matches"
                 WHERE "candidate_id" IN (
                    SELECT "id" FROM "workflow_match_candidates"
                    WHERE "session_id" = $1
                 )`,
                [input.sessionId]
            );

            // 2. Candidate scores/ranks/statuses — updated in place; the rows
            // already exist from createCandidates (no duplicates possible).
            const candidateStatuses: PersistDecisionCandidateStatus[] = [];

            for (const candidate of input.candidates) {
                const score =
                    input.scoresByLibraryId.get(candidate.workflowLibraryId) ??
                    null;

                let status = 'CANDIDATE';
                let reasoning: string | null = null;

                if (
                    input.primaryCandidateLibraryId != null &&
                    candidate.workflowLibraryId === input.primaryCandidateLibraryId
                ) {
                    status = 'SELECTED';
                } else if (candidate.eligible === false) {
                    // Documented engine semantics: a gate FAIL disqualifies
                    // the candidate from REUSE (hard-gate-evaluator header).
                    status = 'DISQUALIFIED';
                    reasoning = candidate.failedGates;
                }

                // Scores only from the genuine ranker output — never
                // manufactured (BUILD produces no ranking).
                const matchScore = score ? score.totalScore : null;
                const rank = score ? score.rank : null;

                await client.query(
                    `UPDATE "workflow_match_candidates"
                     SET "match_score" = $2, "rank" = $3, "status" = $4, "reasoning" = $5
                     WHERE "id" = $1`,
                    [candidate.candidateRowId, matchScore, rank, status, reasoning]
                );

                candidateStatuses.push({
                    candidateRowId: candidate.candidateRowId,
                    status,
                    matchScore,
                    rank
                });

                // 3. Requirement coverage evidence — genuine
                // RequirementCoverageAnalyzer output only.
                const coverage = input.coverageByLibraryId.get(
                    candidate.workflowLibraryId
                );

                if (coverage && coverage.length > 0) {
                    for (const result of coverage) {
                        await client.query(
                            `INSERT INTO "workflow_requirement_matches" (
                                "candidate_id",
                                "requirement_id",
                                "coverage_level",
                                "evidence",
                                "confidence",
                                "is_must_requirement"
                            )
                            VALUES ($1, $2, $3, $4, $5, $6)`,
                            [
                                candidate.candidateRowId,
                                result.requirementId,
                                result.level,
                                result.evidence,
                                result.confidence,
                                mustByRequirementId.has(result.requirementId)
                            ]
                        );
                    }
                }
            }

            // 4. Solution architecture (final recommendation) in its existing
            // initial DRAFT state; version defaults to 1 per the schema.
            const blueprint = {
                sessionId: input.sessionId,
                leadId: input.leadId,
                strategy: input.strategy,
                primaryCandidateId: input.primaryCandidateLibraryId,
                reasoning: input.reasoning,
                evidence: input.evidence,
                rejectedStrategies: input.rejectedStrategies,
                // STEP 9: composition analysis rides the existing free-form
                // JSONB blueprint — no migration, no new columns. Only non-null
                // when the strategy ladder reached COMPOSE with a plan.
                ...(input.composition ? { composition: input.composition } : {}),
                candidateSummary: candidateStatuses.map((item) => {
                    const candidate = input.candidates.find(
                        (entry) => entry.candidateRowId === item.candidateRowId
                    );

                    return {
                        workflowId: candidate?.workflowLibraryId ?? null,
                        matchScore: item.matchScore,
                        rank: item.rank,
                        status: item.status
                    };
                }),
                generatedAt: new Date().toISOString()
            };

            const architectureResult = await client.query(
                `INSERT INTO "solution_architectures" (
                    "session_id",
                    "lead_id",
                    "strategy",
                    "blueprint",
                    "status"
                )
                VALUES ($1, $2, $3, $4, 'DRAFT')
                RETURNING "id"`,
                [
                    input.sessionId,
                    input.leadId,
                    input.strategy,
                    JSON.stringify(blueprint)
                ]
            );

            const solutionArchitectureId = String(architectureResult.rows[0].id);

            return {
                solutionArchitectureId,
                alreadyPersisted: false,
                sessionStatus,
                candidateStatuses
            };
        });
    }
}

export const matchingPersistenceService = new MatchingPersistenceService();




