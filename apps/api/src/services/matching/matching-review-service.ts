/**
 * @file matching-review-service.ts
 * @description Human review of the persisted matching recommendation
 * (STEP 5). Closes the migration-008 session lifecycle documented values
 * ANALYZING -> MATCHED/REVIEW_REQUIRED -> APPROVED/REJECTED.
 *
 * APPROVED ARCHITECTURAL DECISION (OPTION B):
 *   Approval  = session -> APPROVED  AND  solution_architectures DRAFT ->
 *               APPROVED (+ approved_by/approved_at).
 *   Rejection = session -> REJECTED ONLY. The solution_architectures row
 *               INTENTIONALLY remains DRAFT: its meaning after session
 *               rejection is "not selected / not consumable". The matching
 *               session is the authoritative decision boundary. A
 *               session=REJECTED + architecture=DRAFT combination is the
 *               approved valid state, NOT an error.
 *
 * The review operates EXCLUSIVELY on the state persisted by
 * MatchingPersistenceService.persistDecision (STEP 4): the workflow_match_sessions
 * row and its solution_architectures artifact. It never calls any matching
 * engine, never recalculates, and never converts one strategy into another.
 *
 * CONTRACT BASIS (inspected, not assumed):
 * - workflow_match_sessions.status: migration 008 documents ANALYZING,
 *   MATCHED, REVIEW_REQUIRED, APPROVED, REJECTED — rejection transitions the
 *   session to an explicitly documented value.
 * - solution_architectures.status: migration 008 documents DRAFT as the
 *   initial value, ships approved_by/approved_at columns, and comments the
 *   table as "The final approved blueprint"; the repository itself writes
 *   status 'APPROVED' (phase-11-commercial-verify.ts). => APPROVED is an
 *   explicitly supported persisted value. REJECTED is NOT an established
 *   solution_architectures contract, which is exactly why Option B leaves
 *   the artifact untouched on rejection (no invented status, no columns).
 *
 * ATOMICITY: one db.transaction per decision.
 *   Approval  = session transition + architecture transition + audit.
 *   Rejection = session transition + audit (the atomic unit under Option B).
 * Both rows are FOR UPDATE-locked and every update is conditional
 * (rowCount !== 1 => guard error => full ROLLBACK). session APPROVED +
 * architecture DRAFT remains impossible by construction.
 *
 * IDEMPOTENCY/CONCURRENCY: the session-keyed advisory lock
 * (`matching-session:{sessionId}`, the exact key used by STEP 4) serializes
 * concurrent reviews; a terminal session status (APPROVED/REJECTED) is
 * rejected with MATCHING_REVIEW_ALREADY_DECIDED — a repeated decision never
 * silently re-transitions.
 */

import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';

export interface MatchingReviewResult {
    sessionId: string;
    decision: 'APPROVED' | 'REJECTED';
    strategy: string | null;
    decidedBy: string;
    decidedAt: Date;
    reason: string | null;
}

/** Terminal session statuses that must never re-transition. */
const TERMINAL_SESSION_STATUSES = new Set(['APPROVED', 'REJECTED']);

export class MatchingReviewService {
    /**
     * Approves the persisted matching recommendation for a session.
     * Atomic session + solution_architectures transition.
     */
    async approveMatch(
        sessionId: string,
        userId: string,
        reason?: string
    ): Promise<MatchingReviewResult> {
        return this.decide(sessionId, userId, reason, 'APPROVED');
    }

    /**
     * Rejects the persisted matching recommendation (OPTION B): the session
     * transitions to REJECTED (an explicitly documented migration-008 value)
     * while the solution_architectures artifact intentionally remains DRAFT
     * ("not selected / not consumable"). The optional reason rides the
     * existing audit details payload only — no rejection columns exist and
     * none are invented.
     */
    async rejectMatch(
        sessionId: string,
        userId: string,
        reason?: string
    ): Promise<MatchingReviewResult> {
        return this.decide(sessionId, userId, reason, 'REJECTED');
    }

    private async decide(
        sessionId: string,
        userId: string,
        reason: string | undefined,
        decision: 'APPROVED' | 'REJECTED'
    ): Promise<MatchingReviewResult> {
        const trimmedSessionId = String(sessionId ?? '').trim();
        const trimmedUserId = String(userId ?? '').trim();

        if (!trimmedSessionId) {
            throw new Error('MATCHING_REVIEW_SESSION_NOT_FOUND');
        }

        if (!trimmedUserId) {
            throw new Error('MATCHING_REVIEW_USER_REQUIRED');
        }

        return db.transaction(async (client) => {
            // 1. Session-keyed advisory lock — same key convention as the
            // STEP 4 persistence transaction; serializes concurrent reviews.
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `matching-session:${trimmedSessionId}`
            ]);

            // 2. Load + lock the session row.
            const sessionResult = await client.query(
                `SELECT "id", "status", "strategy"
                 FROM "workflow_match_sessions"
                 WHERE "id" = $1
                 FOR UPDATE`,
                [trimmedSessionId]
            );

            const session = sessionResult.rows[0];

            if (!session) {
                throw new Error('MATCHING_REVIEW_SESSION_NOT_FOUND');
            }

            const status = String(session.status ?? '').trim().toUpperCase();

            // 3. State guards (before any write).
            if (TERMINAL_SESSION_STATUSES.has(status)) {
                throw new Error('MATCHING_REVIEW_ALREADY_DECIDED');
            }

            if (status === 'ANALYZING') {
                throw new Error('MATCHING_REVIEW_NOT_READY');
            }

            if (status !== 'MATCHED' && status !== 'REVIEW_REQUIRED') {
                throw new Error(`MATCHING_REVIEW_SESSION_STATUS_UNSUPPORTED:${status}`);
            }

            // 4. Load + lock the persisted artifact (STEP 4 output).
            const architectureResult = await client.query(
                `SELECT "id", "status"
                 FROM "solution_architectures"
                 WHERE "session_id" = $1
                 FOR UPDATE`,
                [trimmedSessionId]
            );

            const architecture = architectureResult.rows[0];

            if (!architecture) {
                throw new Error('MATCHING_REVIEW_ARCHITECTURE_NOT_FOUND');
            }

            // 5. Conditional session transition
            // (MATCHED/REVIEW_REQUIRED -> APPROVED | REJECTED).
            const sessionUpdate = await client.query(
                `UPDATE "workflow_match_sessions"
                 SET "status" = $2, "updated_at" = NOW()
                 WHERE "id" = $1
                   AND "status" IN ('MATCHED', 'REVIEW_REQUIRED')`,
                [trimmedSessionId, decision]
            );

            if (sessionUpdate.rowCount !== 1) {
                throw new Error('MATCHING_REVIEW_ALREADY_DECIDED');
            }

            const decidedAt = new Date();

            // 6. Artifact handling per the approved Option B semantics.
            if (decision === 'APPROVED') {
                // Conditional architecture transition (DRAFT -> APPROVED) with
                // the schema-shipped approval metadata. A non-DRAFT artifact
                // aborts the whole transaction, so the forbidden
                // "session APPROVED + architecture DRAFT" state cannot exist.
                const architectureUpdate = await client.query(
                    `UPDATE "solution_architectures"
                     SET "status" = $2, "approved_by" = $3, "approved_at" = $4
                     WHERE "id" = $1
                       AND "status" = 'DRAFT'`,
                    [String(architecture.id), decision, trimmedUserId, decidedAt]
                );

                if (architectureUpdate.rowCount !== 1) {
                    throw new Error('MATCHING_REVIEW_ALREADY_DECIDED');
                }
            }

            // Rejection (Option B): the architecture is INTENTIONALLY left
            // DRAFT — no status write, no rejection metadata (none exists).

            // 7. Audit event through the existing project logger. The
            // optional reason rides the existing details payload (no column
            // exists for a review reason on either table; none invented).
            await auditLogger.log({
                action: `MATCHING_REVIEW_${decision}`,
                entityType: 'WorkflowMatchSession',
                entityId: trimmedSessionId,
                details: {
                    strategy: session.strategy ?? null,
                    solutionArchitectureId: String(architecture.id),
                    decidedBy: trimmedUserId,
                    reason: reason?.trim() || null
                }
            });

            return {
                sessionId: trimmedSessionId,
                decision,
                strategy: session.strategy ?? null,
                decidedBy: trimmedUserId,
                decidedAt,
                reason: reason?.trim() || null
            };
        });
    }
}

export const matchingReviewService = new MatchingReviewService();
