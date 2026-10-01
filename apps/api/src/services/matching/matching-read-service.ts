/**
 * @file matching-read-service.ts
 * @description READ-ONLY surface over the persisted matching artifacts
 * (STEP 6). Exposes what Steps 1–5 already persisted; it never recomputes,
 * never writes, and never creates audit records.
 *
 * SOURCES (actual persisted contract only):
 *   workflow_match_sessions   — authoritative review decision boundary
 *                               (ANALYZING/MATCHED/REVIEW_REQUIRED/APPROVED/
 *                               REJECTED; SKIPPED/FAILED are orchestration
 *                               outcomes, not persisted statuses)
 *   workflow_match_candidates — id/workflow_id/match_score/rank/status/reasoning
 *   solution_architectures    — persisted artifact (status DRAFT/APPROVED +
 *                               approved_by/approved_at; blueprint JSONB
 *                               written by MatchingPersistenceService.persistDecision:
 *                               { strategy, primaryCandidateId, reasoning,
 *                                 evidence, rejectedStrategies, candidateSummary, ... })
 *
 * OPTION B (approved): reviewOutcome derives EXCLUSIVELY from the session
 * status — APPROVED (architecture APPROVED + approval metadata) / REJECTED
 * (architecture intentionally still DRAFT, no rejection metadata exists) /
 * null for pending states. Architecture status alone never implies a decision.
 *
 * 1:1 INVARIANT: no DB constraint guarantees one solution_architectures row
 * per session. Multiple rows for one session are an integrity violation and
 * surface as MATCHING_ARCHITECTURE_INVARIANT_VIOLATED — never silently
 * resolved with LIMIT 1 or "newest wins".
 */

import { db } from '../../lib/db';

export const MATCHING_ARCHITECTURE_INVARIANT_VIOLATED =
    'MATCHING_ARCHITECTURE_INVARIANT_VIOLATED';

export interface MatchingDecisionRead {
    status: string;
    strategy: string | null;
    overallConfidence: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MatchingRecommendationRead {
    strategy: string | null;
    primaryCandidateId: string | null;
    reasoning: string | null;
    evidence: string | null;
}

export interface MatchingArchitectureSummaryRead {
    id: string;
    status: string;
    version: number;
    approvedBy: string | null;
    approvedAt: Date | null;
}

export interface MatchingArchitectureDetailRead
    extends MatchingArchitectureSummaryRead {
    blueprint: Record<string, any> | null;
}

export interface MatchingReviewRead {
    reviewOutcome: 'APPROVED' | 'REJECTED' | null;
    decidedBy: string | null;
    decidedAt: Date | null;
}

export interface MatchingSessionListRead {
    sessionId: string;
    leadId: string;
    requirementsAnalysisId: string;
    decision: MatchingDecisionRead;
    architecture: MatchingArchitectureSummaryRead | null;
    review: MatchingReviewRead;
}

export interface MatchingCandidateRead {
    id: string;
    workflowId: string;
    matchScore: number | null;
    rank: number | null;
    status: string;
    reasoning: string | null;
}

/**
 * READ-ONLY workflow_library metadata for one candidate, joined by
 * candidates[].workflowId -> workflow_library.id. Null when the library row
 * no longer exists (dangling reference); never fabricated. The library stays
 * strictly read-only — this is a SELECT-only projection.
 */
export interface MatchingCandidateWorkflowRead {
    name: string | null;
    description: string | null;
    integrations: string[];
    triggers: string[];
    qualityScore: number | null;
    category: string | null;
}

/**
 * READ-ONLY row of workflow_requirement_matches for one candidate
 * (candidate_id -> workflow_match_candidates.id). Genuine
 * RequirementCoverageAnalyzer output persisted by the matching flow;
 * is_must_requirement is the persisted priority projection
 * (priority === 'MUST') — SHOULD/COULD/UNKNOWN are not distinguishable
 * here and no priority semantics are implied by exposing them (Option A:
 * informational only).
 */
export interface MatchingRequirementCoverageRead {
    requirementId: string;
    coverageLevel: string;
    evidence: string | null;
    confidence: number | null;
    isMustRequirement: boolean;
}

/**
 * READ-ONLY row of workflow_compatibility_checks for one candidate
 * (candidate_id -> workflow_match_candidates.id). details carries the
 * evaluator's reason + evidence exactly as persisted.
 */
export interface MatchingGateResultRead {
    gateType: string;
    result: string;
    details: string | null;
}

/**
 * READ-ONLY requirement context for the session's analysis
 * (requirements.analysis_id -> session.requirements_version_id).
 * Priority is informational only (product decision Option A).
 */
export interface MatchingRequirementContextRead {
    id: string;
    title: string | null;
    description: string | null;
    priority: string | null;
}

/** Detail candidate: existing fields plus read-only evidence extensions. */
export interface MatchingCandidateDetailRead extends MatchingCandidateRead {
    workflow: MatchingCandidateWorkflowRead | null;
    coverage: MatchingRequirementCoverageRead[];
    gates: MatchingGateResultRead[];
}

export interface MatchingSessionDetailRead extends MatchingSessionListRead {
    recommendation: MatchingRecommendationRead;
    architecture: MatchingArchitectureDetailRead | null;
    candidates: MatchingCandidateDetailRead[];
    requirements: MatchingRequirementContextRead[];
}

interface SessionRow {
    id: string;
    lead_id: string;
    requirements_version_id: string;
    status: string;
    strategy: string | null;
    overall_confidence: number | null;
    created_at: Date;
    updated_at: Date;
}

interface ArchitectureRow {
    id: string;
    session_id: string;
    status: string;
    version: number | null;
    approved_by: string | null;
    approved_at: Date | null;
    blueprint?: Record<string, any> | null;
}

export class MatchingReadService {
    /**
     * All persisted matching sessions for a lead, newest first. Lightweight:
     * no candidates, no blueprint payload.
     */
    async getLeadMatchingSessions(leadId: string): Promise<MatchingSessionListRead[]> {
        const trimmedLeadId = String(leadId ?? '').trim();

        if (!trimmedLeadId) {
            throw new Error('MATCHING_SESSIONS_NOT_FOUND');
        }

        const sessionsResult = await db.query(
            `SELECT "id", "lead_id", "requirements_version_id", "status",
                    "strategy", "overall_confidence", "created_at", "updated_at"
             FROM "workflow_match_sessions"
             WHERE "lead_id" = $1
             ORDER BY "created_at" DESC`,
            [trimmedLeadId]
        );

        const sessionRows: SessionRow[] = sessionsResult.rows;

        if (sessionRows.length === 0) {
            throw new Error('MATCHING_SESSIONS_NOT_FOUND');
        }

        const architectures = await this.loadArchitecturesForSessions(
            sessionRows.map((row) => row.id),
            false
        );

        return sessionRows.map((row) =>
            this.mapListSession(row, architectures.get(row.id) ?? null)
        );
    }

    /**
     * Full detail for one session, scoped to the requested lead. A missing
     * session and a session owned by another lead return the same
     * not-found error (resource scoping — no separate "wrong lead" signal).
     */
    async getMatchingSessionDetail(
        leadId: string,
        sessionId: string
    ): Promise<MatchingSessionDetailRead> {
        const trimmedLeadId = String(leadId ?? '').trim();
        const trimmedSessionId = String(sessionId ?? '').trim();

        const sessionResult = await db.query(
            `SELECT "id", "lead_id", "requirements_version_id", "status",
                    "strategy", "overall_confidence", "created_at", "updated_at"
             FROM "workflow_match_sessions"
             WHERE "id" = $1`,
            [trimmedSessionId]
        );

        const sessionRow: SessionRow | undefined = sessionResult.rows[0];

        if (!sessionRow || sessionRow.lead_id !== trimmedLeadId) {
            throw new Error('MATCHING_SESSION_NOT_FOUND');
        }

        const architectureMap = await this.loadArchitecturesForSessions(
            [sessionRow.id],
            true
        );

        const architecture = architectureMap.get(sessionRow.id) ?? null;

        const candidatesResult = await db.query(
            `SELECT "id", "workflow_id", "match_score", "rank", "status",
                    "reasoning", "created_at"
             FROM "workflow_match_candidates"
             WHERE "session_id" = $1
             ORDER BY "rank" ASC NULLS LAST,
                      "match_score" DESC NULLS LAST,
                      "created_at" ASC`,
            [sessionRow.id]
        );

        // ----------------------------------------------------------------
        // Review-surface evidence (READ-ONLY extension, batched — one
        // query per data source, never per candidate; empty maps/arrays
        // when there is nothing to fetch; grouping in memory so the
        // candidate rows are never duplicated by one-to-many joins).
        // ----------------------------------------------------------------
        const candidateRowIds = candidatesResult.rows.map((row: any) =>
            String(row.id)
        );
        const distinctWorkflowIds = [
            ...new Set(
                candidatesResult.rows.map((row: any) => String(row.workflow_id))
            )
        ];

        const libraryById = new Map<string, MatchingCandidateWorkflowRead>();

        if (distinctWorkflowIds.length > 0) {
            const libraryResult = await db.query(
                `SELECT "id", "name", "description", "integrations",
                        "triggers", "quality_score", "category"
                 FROM "workflow_library"
                 WHERE "id" = ANY($1::uuid[])`,
                [distinctWorkflowIds]
            );

            for (const row of libraryResult.rows as any[]) {
                libraryById.set(String(row.id), {
                    name: row.name == null ? null : String(row.name),
                    description:
                        row.description == null
                            ? null
                            : String(row.description),
                    integrations: this.parseIntegrationList(row.integrations),
                    triggers: this.parseTriggerList(row.triggers),
                    qualityScore:
                        row.quality_score == null
                            ? null
                            : Number(row.quality_score),
                    category:
                        row.category == null ? null : String(row.category)
                });
            }
        }

        const coverageByCandidate = new Map<
            string,
            MatchingRequirementCoverageRead[]
        >();

        if (candidateRowIds.length > 0) {
            const coverageResult = await db.query(
                `SELECT "candidate_id", "requirement_id", "coverage_level",
                        "evidence", "confidence", "is_must_requirement"
                 FROM "workflow_requirement_matches"
                 WHERE "candidate_id" = ANY($1::uuid[])
                 ORDER BY "requirement_id" ASC`,
                [candidateRowIds]
            );

            for (const row of coverageResult.rows as any[]) {
                const candidateKey = String(row.candidate_id);
                const list = coverageByCandidate.get(candidateKey) ?? [];
                list.push({
                    requirementId: String(row.requirement_id),
                    coverageLevel: String(row.coverage_level ?? 'UNKNOWN'),
                    evidence: row.evidence == null ? null : String(row.evidence),
                    confidence:
                        row.confidence == null ? null : Number(row.confidence),
                    isMustRequirement: row.is_must_requirement === true
                });
                coverageByCandidate.set(candidateKey, list);
            }
        }

        const gatesByCandidate = new Map<string, MatchingGateResultRead[]>();

        if (candidateRowIds.length > 0) {
            const gatesResult = await db.query(
                `SELECT "candidate_id", "gate_type", "result", "details"
                 FROM "workflow_compatibility_checks"
                 WHERE "candidate_id" = ANY($1::uuid[])
                 ORDER BY "created_at" ASC`,
                [candidateRowIds]
            );

            for (const row of gatesResult.rows as any[]) {
                const candidateKey = String(row.candidate_id);
                const list = gatesByCandidate.get(candidateKey) ?? [];
                list.push({
                    gateType: String(row.gate_type ?? ''),
                    result: String(row.result ?? 'UNKNOWN'),
                    details: row.details == null ? null : String(row.details)
                });
                gatesByCandidate.set(candidateKey, list);
            }
        }

        const requirementsContext: MatchingRequirementContextRead[] = [];

        if (sessionRow.requirements_version_id) {
            const requirementsResult = await db.query(
                `SELECT "id", "title", "description", "priority"
                 FROM "requirements"
                 WHERE "analysis_id" = $1
                 ORDER BY "created_at" ASC`,
                [String(sessionRow.requirements_version_id)]
            );

            for (const row of requirementsResult.rows as any[]) {
                requirementsContext.push({
                    id: String(row.id),
                    title: row.title == null ? null : String(row.title),
                    description:
                        row.description == null
                            ? null
                            : String(row.description),
                    priority:
                        row.priority == null ? null : String(row.priority)
                });
            }
        }

        const base = this.mapListSession(sessionRow, architecture);

        return {
            ...base,
            recommendation: this.mapRecommendation(
                architecture,
                sessionRow.strategy
            ),
            architecture: architecture
                ? this.mapArchitectureDetail(architecture)
                : null,
            candidates: candidatesResult.rows.map((row: any) => ({
                id: String(row.id),
                workflowId: String(row.workflow_id),
                matchScore: row.match_score == null ? null : Number(row.match_score),
                rank: row.rank == null ? null : Number(row.rank),
                status: String(row.status ?? 'CANDIDATE'),
                reasoning: row.reasoning ?? null,
                workflow: libraryById.get(String(row.workflow_id)) ?? null,
                coverage: coverageByCandidate.get(String(row.id)) ?? [],
                gates: gatesByCandidate.get(String(row.id)) ?? []
            })),
            requirements: requirementsContext
        };
    }

    /**
     * Read-only representation parser for the library TEXT integrations
     * column: comma-separated, trimmed, empties removed — the same
     * representation semantics the matching normalizer applies. Presentational
     * only; no matching behavior lives here.
     */
    private parseIntegrationList(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
        }

        if (typeof value !== 'string') {
            return [];
        }

        return value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }

    /**
     * Read-only representation parser for the library JSONB triggers column:
     * pg already delivers arrays; a JSON/scalar string is safely unwrapped.
     * No trigger values are invented.
     */
    private parseTriggerList(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
        }

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

    // ------------------------------------------------------------------
    // Shared read helpers (SELECT only)
    // ------------------------------------------------------------------

    /**
     * Loads architecture rows for the given sessions and enforces the 1:1
     * invariant. includeBlueprint only fetches the JSONB payload where the
     * caller actually needs it (detail endpoint).
     */
    private async loadArchitecturesForSessions(
        sessionIds: string[],
        includeBlueprint: boolean
    ): Promise<Map<string, ArchitectureRow>> {
        const result = await db.query(
            `SELECT "id", "session_id", "status", "version",
                    "approved_by", "approved_at"${
                        includeBlueprint ? ', "blueprint"' : ''
                    }
             FROM "solution_architectures"
             WHERE "session_id" = ANY($1::uuid[])`,
            [sessionIds]
        );

        const grouped = new Map<string, ArchitectureRow[]>();

        for (const row of result.rows as ArchitectureRow[]) {
            const list = grouped.get(row.session_id) ?? [];
            list.push(row);
            grouped.set(row.session_id, list);
        }

        const single = new Map<string, ArchitectureRow>();

        for (const [sessionId, rows] of grouped) {
            if (rows.length > 1) {
                throw new Error(MATCHING_ARCHITECTURE_INVARIANT_VIOLATED);
            }

            single.set(sessionId, rows[0]);
        }

        return single;
    }

    private mapListSession(
        row: SessionRow,
        architecture: ArchitectureRow | null
    ): MatchingSessionListRead {
        return {
            sessionId: String(row.id),
            leadId: String(row.lead_id),
            requirementsAnalysisId: String(row.requirements_version_id),
            decision: {
                status: String(row.status),
                strategy: row.strategy ?? null,
                overallConfidence:
                    row.overall_confidence == null
                        ? null
                        : Number(row.overall_confidence),
                createdAt: row.created_at,
                updatedAt: row.updated_at
            },
            architecture: architecture
                ? this.mapArchitectureSummary(architecture)
                : null,
            review: this.mapReview(row.status, architecture)
        };
    }

    private mapArchitectureSummary(
        architecture: ArchitectureRow
    ): MatchingArchitectureSummaryRead {
        return {
            id: String(architecture.id),
            status: String(architecture.status),
            version:
                architecture.version == null ? 1 : Number(architecture.version),
            approvedBy: architecture.approved_by ?? null,
            approvedAt: architecture.approved_at ?? null
        };
    }

    private mapArchitectureDetail(
        architecture: ArchitectureRow
    ): MatchingArchitectureDetailRead {
        return {
            ...this.mapArchitectureSummary(architecture),
            blueprint: architecture.blueprint ?? null
        };
    }

    /**
     * Recommendation mapping — ONLY from the persisted blueprint written by
     * persistDecision ({ strategy, primaryCandidateId, reasoning, evidence }).
     * Missing blueprint fields map to null; nothing is inferred from
     * workflow_match_candidates and no engine is re-run.
     */
    private mapRecommendation(
        architecture: ArchitectureRow | null,
        sessionStrategy: string | null
    ): MatchingRecommendationRead {
        const blueprint = (architecture?.blueprint ?? null) as
            | Record<string, any>
            | null;

        return {
            strategy: blueprint?.strategy ?? sessionStrategy ?? null,
            primaryCandidateId: blueprint?.primaryCandidateId ?? null,
            reasoning: blueprint?.reasoning ?? null,
            evidence: blueprint?.evidence ?? null
        };
    }

    /**
     * OPTION B: the session status is the authoritative review decision.
     * decidedBy/decidedAt come from the schema-shipped approval metadata
     * (APPROVED only); rejection has no persisted decision metadata and
     * maps to null rather than invented fields.
     */
    private mapReview(
        sessionStatus: string,
        architecture: ArchitectureRow | null
    ): MatchingReviewRead {
        const status = String(sessionStatus ?? '').trim().toUpperCase();

        if (status === 'APPROVED') {
            return {
                reviewOutcome: 'APPROVED',
                decidedBy: architecture?.approved_by ?? null,
                decidedAt: architecture?.approved_at ?? null
            };
        }

        if (status === 'REJECTED') {
            // Option B: the artifact intentionally remains DRAFT and no
            // rejection metadata exists; the session row is the decision.
            return {
                reviewOutcome: 'REJECTED',
                decidedBy: null,
                decidedAt: null
            };
        }

        return { reviewOutcome: null, decidedBy: null, decidedAt: null };
    }
}

export const matchingReadService = new MatchingReadService();
