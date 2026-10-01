/**
 * @file matching-commercial-handoff-service.ts
 * @description STEP 7 production handoff: converts a human-APPROVED matching
 * session into a DRAFT commercial package, using ONLY existing repository
 * contracts.
 *
 * CHAIN (all persisted state; session/architecture statuses never change):
 *   APPROVED matching session (workflow_match_sessions)
 *     -> APPROVED solution architecture (solution_architectures, STEP 5)
 *     -> DRAFT workflow_versions anchor (solution_id = architecture.id)
 *     -> DRAFT commercial_package (existing 018 contract via
 *        CommercialFoundationService.createCommercialPackageWithClient)
 *
 * CONTRACT BASIS (verified, not assumed):
 * - workflow_versions.solution_id is NOT NULL with NO foreign key
 *   (migration 009), so anchoring on solution_architectures.id is possible
 *   without any migration. With workflow_source_id = NULL the table's
 *   UNIQUE(solution_id, workflow_source_id, version_number) constraint does
 *   NOT provide real uniqueness protection in PostgreSQL (NULLs compare
 *   distinct); the actual protection is the session-keyed advisory lock plus
 *   a SELECT pre-check — documented here explicitly.
 * - The anchor is intentionally DRAFT with artifact_id NULL. It is NOT a
 *   deployable workflow version: it must not enter finalizeVersion (which
 *   reads the artifact), rollback, deployment or artifact execution paths.
 * - origin_type uses the existing OriginType enum values
 *   (services/versioning/version-service.ts): REUSED / CUSTOMIZED / COMPOSED
 *   / CUSTOM_BUILT, mapped 1:1 from the persisted blueprint strategy
 *   (REUSE/CUSTOMIZE/COMPOSE/BUILD). No enum values are added.
 * - content_hash is SHA-256 over the persisted blueprint EXACTLY as stored
 *   (parsed jsonb re-serialized deterministically via JSON.stringify — the
 *   repository's established approach), computed with the existing
 *   HashService. The blueprint is hashed as stored, never rebuilt.
 * - commercial_packages (migration 018) requires company_id/contact_id NOT
 *   NULL: they are derived inside the same transaction from the persisted
 *   leads row — never invented, never fabricated.
 * - Package application-level identity is (lead_id, solution_version_id)
 *   (the foundation service's own idempotency key); there is no DB unique
 *   constraint, so the pre-check below applies to ANY package status.
 * - currency falls back to the existing repository default USD (schema
 *   DEFAULT 'USD' + foundation service behavior) — no new default.
 *
 * AUDIT: auditLogger is console/observability only (NOT persisted, NOT
 * transactional). The MATCHING_COMMERCIAL_HANDOFF_COMPLETED event is
 * observability; the database transaction remains correct without it.
 *
 * NO RECOMPUTATION: only persisted data is read. No matching engine, no
 * candidate search, no strategy engine, no orchestrator/persistence/review
 * services are invoked.
 */

import crypto from 'crypto';

import type { PoolClient } from 'pg';

import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';
import { hashService } from '../versioning/hash-service';
import { commercialFoundationService } from './commercial-foundation-service';
import type { CommercialPackage } from './commercial-types';

/** Session statuses that must never reach handoff (terminal, non-approved). */
const HANDOFF_REVIEWABLE_STATUSES = new Set(['MATCHED', 'REVIEW_REQUIRED']);

/** Blueprint strategy -> existing OriginType enum value. */
const STRATEGY_TO_ORIGIN_TYPE: Record<string, string> = {
    REUSE: 'REUSED',
    CUSTOMIZE: 'CUSTOMIZED',
    COMPOSE: 'COMPOSED',
    BUILD: 'CUSTOM_BUILT'
};

export interface MatchingHandoffResult {
    sessionId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    commercialPackageId: string;
    /** true when an existing package was reused for the same identity */
    reusedPackage: boolean;
}

export class MatchingCommercialHandoffService {
    /**
     * Atomically converts an APPROVED matching session into a DRAFT
     * commercial package. Idempotent per
     * (sessionId -> architecture -> version anchor, lead+anchor package).
     */
    async handoffApprovedSession(input: {
        leadId: string;
        sessionId: string;
        userId: string;
        currency?: string;
    }): Promise<MatchingHandoffResult> {
        const leadId = String(input?.leadId ?? '').trim();
        const sessionId = String(input?.sessionId ?? '').trim();
        const userId = String(input?.userId ?? '').trim();
        const currency = input?.currency
            ? String(input.currency).trim()
            : undefined;

        return db.transaction(async (client) => {
            // 2. Session-keyed advisory lock — same identity pattern as the
            // STEP 4 persistence and STEP 5 review transactions.
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `matching-session:${sessionId}`
            ]);

            // 3. Load + lock ONLY the session row.
            // PostgreSQL does not allow FOR UPDATE on the nullable side
            // of an outer join, so requirements_analyses is loaded separately.
            const sessionResult = await client.query(
                `SELECT
                     "id",
                     "lead_id",
                     "status",
                     "requirements_version_id"
                 FROM "workflow_match_sessions"
                 WHERE "id" = $1
                 FOR UPDATE`,
                [sessionId]
            );

            const session = sessionResult.rows[0];

            // 4. Load the requirements-analysis identity separately.
            // This remains inside the same transaction but is not row-locked.
            if (session?.requirements_version_id) {
                const requirementsAnalysisResult = await client.query(
                    `SELECT
                         "pain_analysis_version_id",
                         "qualification_version_id"
                     FROM "requirements_analyses"
                     WHERE "id" = $1`,
                    [session.requirements_version_id]
                );

                const requirementsAnalysis =
                    requirementsAnalysisResult.rows[0];

                session.pain_analysis_version_id =
                    requirementsAnalysis?.pain_analysis_version_id ?? null;
                session.qualification_version_id =
                    requirementsAnalysis?.qualification_version_id ?? null;
            } else {
                session.pain_analysis_version_id = null;
                session.qualification_version_id = null;
            }

            // 5. Session state guards (before any write). A missing session
            // and a session owned by another lead are the SAME not-found
            // error (resource scoping — no wrong-lead signal).
            if (!session || String(session.lead_id) !== leadId) {
                throw new Error('MATCHING_HANDOFF_SESSION_NOT_FOUND');
            }

            const sessionStatus = String(session.status ?? '')
                .trim()
                .toUpperCase();

            if (sessionStatus === 'ANALYZING') {
                throw new Error('MATCHING_HANDOFF_NOT_READY');
            }

            if (sessionStatus === 'REJECTED') {
                throw new Error('MATCHING_HANDOFF_REJECTED_SESSION');
            }

            if (
                sessionStatus !== 'APPROVED' &&
                HANDOFF_REVIEWABLE_STATUSES.has(sessionStatus)
            ) {
                throw new Error('MATCHING_HANDOFF_NOT_APPROVED');
            }

            if (sessionStatus !== 'APPROVED') {
                throw new Error(
                    `MATCHING_HANDOFF_SESSION_STATUS_UNSUPPORTED:${sessionStatus}`
                );
            }

            // 6. Load + lock the architecture and enforce the 1:1 invariant
            // (multiple rows = integrity violation; never LIMIT 1).
            const architectureResult = await client.query(
                `SELECT "id", "status", "blueprint"
                 FROM "solution_architectures"
                 WHERE "session_id" = $1
                 FOR UPDATE`,
                [sessionId]
            );

            if (architectureResult.rows.length === 0) {
                throw new Error('MATCHING_HANDOFF_ARCHITECTURE_NOT_FOUND');
            }

            if (architectureResult.rows.length > 1) {
                throw new Error('MATCHING_ARCHITECTURE_INVARIANT_VIOLATED');
            }

            const architecture = architectureResult.rows[0];

            if (String(architecture.status).toUpperCase() !== 'APPROVED') {
                throw new Error('MATCHING_HANDOFF_ARCHITECTURE_NOT_APPROVED');
            }

            // Persisted blueprint exactly as stored (no recomputation).
            const blueprint = (architecture.blueprint ?? null) as Record<
                string,
                any
            > | null;

            // 7. Strategy -> existing OriginType enum value (no invention).
            const blueprintStrategy = blueprint?.strategy
                ? String(blueprint.strategy).trim().toUpperCase()
                : null;

            const originType = blueprintStrategy
                ? STRATEGY_TO_ORIGIN_TYPE[blueprintStrategy]
                : undefined;

            if (!originType) {
                throw new Error('MATCHING_HANDOFF_STRATEGY_NOT_HANDOFFABLE');
            }

            // 8. Create/reuse the DRAFT version anchor (one per approved
            // architecture). Pre-check under the advisory lock is the actual
            // uniqueness mechanism (see header).
            const architectureId = String(architecture.id);

            const existingAnchor = await client.query(
                `SELECT "id" FROM "workflow_versions"
                 WHERE "solution_id" = $1
                   AND "workflow_source_id" IS NULL
                 LIMIT 1`,
                [architectureId]
            );

            let solutionVersionId: string;

            if (existingAnchor.rows[0]) {
                solutionVersionId = String(existingAnchor.rows[0].id);
            } else {
                // Deterministic serialization of the stored blueprint — the
                // repository's established approach (parse jsonb, stringify).
                const blueprintJson = JSON.stringify(blueprint ?? {});
                const contentHash = hashService.hashBuffer(
                    Buffer.from(blueprintJson, 'utf8')
                );

                const anchorResult = await client.query(
                    `INSERT INTO "workflow_versions" (
                        "solution_id",
                        "version_number",
                        "content_hash",
                        "status",
                        "origin_type",
                        "change_summary",
                        "workflow_source_id",
                        "artifact_id",
                        "is_immutable",
                        "created_by",
                        "created_at"
                    )
                    VALUES ($1, 1, $2, 'DRAFT', $3, $4, NULL, NULL, false, $5, NOW())
                    RETURNING "id"`,
                    [
                        architectureId,
                        contentHash,
                        originType,
                        `Commercial handoff anchor for approved matching session ${sessionId} (strategy ${blueprintStrategy}).`,
                        userId
                    ]
                );

                solutionVersionId = String(anchorResult.rows[0].id);
            }

            // 9. Create/reuse the DRAFT commercial package.
            // Application-level identity: (lead_id, solution_version_id) for
            // ANY package status (no DB unique constraint protects the pair).
            const existingPackage = await client.query(
                `SELECT "id" FROM "commercial_packages"
                 WHERE "lead_id" = $1
                   AND "solution_version_id" = $2
                 LIMIT 1`,
                [leadId, solutionVersionId]
            );

            if (existingPackage.rows[0]) {
                // Replay: return the same IDs without creating anything.
                await auditLogger.log({
                    action: 'MATCHING_COMMERCIAL_HANDOFF_COMPLETED',
                    entityType: 'MatchingCommercialHandoff',
                    entityId: sessionId,
                    details: {
                        leadId,
                        solutionArchitectureId: architectureId,
                        solutionVersionId,
                        commercialPackageId: String(existingPackage.rows[0].id),
                        reusedPackage: true
                    }
                });

                return {
                    sessionId,
                    solutionArchitectureId: architectureId,
                    solutionVersionId,
                    commercialPackageId: String(existingPackage.rows[0].id),
                    reusedPackage: true
                };
            }

            // Derive company/contact context from the persisted lead row
            // (same transaction; never invented, never fabricated).
            const leadResult = await client.query(
                `SELECT "company_id", "contact_id"
                 FROM "leads"
                 WHERE "id" = $1`,
                [leadId]
            );

            const lead = leadResult.rows[0];

            if (
                !lead ||
                !lead.company_id ||
                !lead.contact_id
            ) {
                throw new Error('MATCHING_HANDOFF_LEAD_CONTEXT_MISSING');
            }

            const requirementsVersionId = String(
                session.requirements_version_id ?? ''
            ).trim();

            const painAnalysisVersionId = String(
                session.pain_analysis_version_id ?? ''
            ).trim();

            const qualificationVersionId = String(
                session.qualification_version_id ?? ''
            ).trim();

            if (
                !requirementsVersionId ||
                !painAnalysisVersionId ||
                !qualificationVersionId
            ) {
                throw new Error(
                    'MATCHING_HANDOFF_VERSION_CHAIN_INCOMPLETE'
                );
            }

            // Existing foundation behavior on the supplied client (package
            // creation + its own audit event + existing defaults).
            const createdPackage: CommercialPackage =
                await commercialFoundationService.createCommercialPackageWithClient(
                    client,
                    {
                        leadId,
                        companyId: String(lead.company_id),
                        contactId: String(lead.contact_id),
                        solutionArchitectureId: architectureId,
                        solutionVersionId,
                        requirementsVersionId,
                        painAnalysisVersionId,
                        qualificationVersionId,
                        userId,
                        currency
                    }
                );

            // 10. Observability event (console-only, non-transactional).
            await auditLogger.log({
                action: 'MATCHING_COMMERCIAL_HANDOFF_COMPLETED',
                entityType: 'MatchingCommercialHandoff',
                entityId: sessionId,
                details: {
                    leadId,
                    solutionArchitectureId: architectureId,
                    solutionVersionId,
                    commercialPackageId: createdPackage.commercialPackageId,
                    reusedPackage: false
                }
            });

            return {
                sessionId,
                solutionArchitectureId: architectureId,
                solutionVersionId,
                commercialPackageId: createdPackage.commercialPackageId,
                reusedPackage: false
            };
        });
    }
}

export const matchingCommercialHandoffService =
    new MatchingCommercialHandoffService();

