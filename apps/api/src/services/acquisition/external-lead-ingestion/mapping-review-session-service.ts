import crypto from "crypto";
import fs from "fs";
import { db } from "../../../lib/db";
import type {
    MappingPreview,
    MappingSectionPreview,
    MappingPreviewColumn,
} from "./mapping-preview-service";
import {
    CANONICAL_FIELD_BY_PROFILER_FIELD,
} from "./mapping-preview-service";

/**
 * @file mapping-review-session-service.ts
 * @description Persistent Review Session layer over the Mapping Preview.
 *
 * Converts Mapping Preview proposals into explicit HUMAN decisions while
 * preserving the strict distinction between:
 *   - system proposals (immutable preview_snapshot evidence, never
 *     overwritten by human decisions)
 *   - human-approved decisions (queryable + auditable rows)
 *
 * Semantic rules:
 *   ACCEPT     -> approvedField = proposedField (human confirmed)
 *   CHANGE     -> approvedField = human-selected canonical field
 *   REJECT     -> approvedField = null (column will not be used)
 *   UNRESOLVED -> no human decision yet
 *
 * Hard safety contract:
 *   - APPROVED is a review-workflow state only; it triggers NO import.
 *   - This service writes ONLY mapping_review_* tables; it never writes
 *     companies, contacts, leads, or raw_lead_staging.
 *   - Source identity is pinned by sha256 checksum; a changed source file
 *     is a different identity and cannot silently reuse a session.
 *   - No country-specific logic, no row-number hardcoding, no silent
 *     conversion of REVIEW_REQUIRED proposals into SAFE.
 */

export type ReviewSessionStatus =
    | "DRAFT"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED";

export type ReviewSectionStatus =
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED";

export type MappingDecisionType =
    | "UNRESOLVED"
    | "ACCEPT"
    | "CHANGE"
    | "REJECT";

export type ResolvableDecision = Exclude<
    MappingDecisionType,
    "UNRESOLVED"
>;

/**
 * Canonical fields a human may CHANGE a mapping to. Derived from the
 * existing preview domain mapping (no second canonical-field enum).
 */
export const REVIEWABLE_CANONICAL_FIELDS: ReadonlySet<string> =
    new Set(
        Object.values(
            CANONICAL_FIELD_BY_PROFILER_FIELD,
        ).filter((field): field is string => field !== null),
    );

export interface CreateReviewSessionInput {
    preview: MappingPreview;
    filePath: string;
    /** sha256 hex of the source file; computed when omitted. */
    sourceChecksum?: string;
    batchId?: string | null;
    createdBy?: string | null;
}

export interface MappingDecisionRecord {
    id: string;
    sectionId: string;
    sourceColumn: string;
    proposedField: string | null;
    approvedField: string | null;
    decision: MappingDecisionType;
    originalConfidence: string | null;
    originalConfidenceLevel: string | null;
    mappingConflict: string | null;
    reviewNote: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
}

export interface ReviewSectionRecord {
    id: string;
    reviewSessionId: string;
    sectionIndex: number;
    startRowIndex: number;
    endRowIndex: number;
    structuralPattern: string;
    sectionType: string;
    status: ReviewSectionStatus;
    reviewedAt: Date | null;
    reviewedBy: string | null;
}

export interface ReviewSessionRecord {
    id: string;
    sourceFileName: string;
    sourceFilePath: string;
    sourceChecksum: string;
    batchId: string | null;
    status: ReviewSessionStatus;
    previewSnapshot: MappingPreview;
    createdBy: string | null;
    createdAt: Date;
    reviewedBy: string | null;
    reviewedAt: Date | null;
}

export interface ReviewSessionDetail {
    session: ReviewSessionRecord;
    sections: Array<
        ReviewSectionRecord & {
            decisions: MappingDecisionRecord[];
            snapshot: MappingSectionPreview | null;
        }
    >;
}

export class ReviewSessionError extends Error {
    constructor(
        public readonly code:
            | "SESSION_NOT_FOUND"
            | "SECTION_NOT_FOUND"
            | "COLUMN_NOT_IN_SNAPSHOT"
            | "PROPOSAL_MISMATCH"
            | "INVALID_FIELD"
            | "SESSION_IMMUTABLE"
            | "SECTION_HAS_UNRESOLVED"
            | "SESSION_HAS_UNRESOLVED"
            | "PREVIEW_MISMATCH",
        message: string,
    ) {
        super(message);
        this.name = "ReviewSessionError";
    }
}

function mapSessionRow(row: any): ReviewSessionRecord {
    return {
        id: row.id,
        sourceFileName: row.source_file_name,
        sourceFilePath: row.source_file_path,
        sourceChecksum: row.source_checksum,
        batchId: row.batch_id ?? null,
        status: row.status,
        previewSnapshot: row.preview_snapshot,
        createdBy: row.created_by ?? null,
        createdAt: row.created_at,
        reviewedBy: row.reviewed_by ?? null,
        reviewedAt: row.reviewed_at ?? null,
    };
}

function mapSectionRow(row: any): ReviewSectionRecord {
    return {
        id: row.id,
        reviewSessionId: row.review_session_id,
        sectionIndex: row.section_index,
        startRowIndex: row.start_row_index,
        endRowIndex: row.end_row_index,
        structuralPattern: row.structural_pattern,
        sectionType: row.section_type,
        status: row.status,
        reviewedAt: row.reviewed_at ?? null,
        reviewedBy: row.reviewed_by ?? null,
    };
}

function mapDecisionRow(row: any): MappingDecisionRecord {
    return {
        id: row.id,
        sectionId: row.section_id,
        sourceColumn: row.source_column,
        proposedField: row.proposed_field,
        approvedField: row.approved_field,
        decision: row.decision,
        originalConfidence: row.original_confidence,
        originalConfidenceLevel: row.original_confidence_level,
        mappingConflict: row.mapping_conflict,
        reviewNote: row.review_note,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
    };
}

function findSnapshotColumn(
    sectionSnapshot: MappingSectionPreview,
    sourceColumn: string,
): MappingPreviewColumn | null {
    return (
        sectionSnapshot.columns.find(
            column => column.sourceColumn === sourceColumn,
        ) ?? null
    );
}

function basename(filePath: string): string {
    return filePath.split(/[\\/]/).pop() ?? filePath;
}

export class MappingReviewSessionService {
    /**
     * Create a review session from a Mapping Preview result.
     * Idempotent per source checksum: creating again for the same source
     * version returns the existing session unchanged.
     */
    async createReviewSession(
        input: CreateReviewSessionInput,
    ): Promise<ReviewSessionRecord> {
        const checksum =
            input.sourceChecksum ??
            crypto
                .createHash("sha256")
                .update(fs.readFileSync(input.filePath))
                .digest("hex");

        const existing = await db.query(
            `SELECT * FROM mapping_review_sessions
             WHERE source_checksum = $1
             LIMIT 1`,
            [checksum],
        );

        if (existing.rows[0]) {
            return mapSessionRow(existing.rows[0]);
        }

        const created = await db.transaction(async client => {
            const sessionResult = await client.query(
                `INSERT INTO mapping_review_sessions (
                    source_file_name,
                    source_file_path,
                    source_checksum,
                    batch_id,
                    status,
                    preview_snapshot,
                    created_by
                )
                VALUES ($1, $2, $3, $4, 'DRAFT', $5::jsonb, $6)
                RETURNING *`,
                [
                    input.preview.fileName ??
                        basename(input.filePath),
                    input.filePath,
                    checksum,
                    input.batchId ?? null,
                    JSON.stringify(input.preview),
                    input.createdBy ?? null,
                ],
            );

            const session = sessionResult.rows[0];

            for (
                let index = 0;
                index < input.preview.sections.length;
                index++
            ) {
                const section =
                    input.preview.sections[index];

                const sectionResult = await client.query(
                    `INSERT INTO mapping_review_sections (
                        review_session_id,
                        section_index,
                        start_row_index,
                        end_row_index,
                        structural_pattern,
                        section_type,
                        status
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, 'IN_REVIEW')
                    RETURNING id`,
                    [
                        session.id,
                        index,
                        section.startRowIndex,
                        section.endRowIndex,
                        section.structuralPattern,
                        section.sectionType,
                    ],
                );

                const sectionId =
                    sectionResult.rows[0].id;

                for (const column of section.columns) {
                    await client.query(
                        `INSERT INTO mapping_review_decisions (
                            section_id,
                            source_column,
                            proposed_field,
                            decision,
                            original_confidence,
                            original_confidence_level,
                            mapping_conflict,
                            review_required
                        )
                        VALUES ($1, $2, $3, 'UNRESOLVED', $4, $5, $6, $7)`,
                        [
                            sectionId,
                            column.sourceColumn,
                            column.proposedField,
                            column.confidence,
                            column.confidenceLevel,
                            column.mappingConflict ?? null,
                            column.reviewRequired ||
                                column.mappingConflict !==
                                    null,
                        ],
                    );
                }

                /*
                 * NO-IMPORT GUARD: the only tables written in this whole
                 * service are mapping_review_sessions, mapping_review_
                 * sections, and mapping_review_decisions. No statements
                 * touching companies, contacts, leads, or raw_lead_staging
                 * exist in this file.
                 */
            }

            return session;
        });

        return mapSessionRow(created);
    }

    async getReviewSession(
        sessionId: string,
    ): Promise<ReviewSessionDetail | null> {
        const sessionResult = await db.query(
            `SELECT * FROM mapping_review_sessions WHERE id = $1`,
            [sessionId],
        );

        if (!sessionResult.rows[0]) {
            return null;
        }

        const session = mapSessionRow(
            sessionResult.rows[0],
        );

        const sectionRows = await db.query(
            `SELECT * FROM mapping_review_sections
             WHERE review_session_id = $1
             ORDER BY section_index ASC`,
            [sessionId],
        );

        const sections = [];

        for (const row of sectionRows.rows) {
            const decisionRows = await db.query(
                `SELECT * FROM mapping_review_decisions
                 WHERE section_id = $1
                 ORDER BY source_column ASC`,
                [row.id],
            );

            sections.push({
                ...mapSectionRow(row),
                decisions: decisionRows.rows.map(
                    mapDecisionRow,
                ),
                snapshot:
                    session.previewSnapshot?.sections?.[
                        row.section_index
                    ] ?? null,
            });
        }

        return { session, sections };
    }

    async listReviewSessions(
        limit = 50,
    ): Promise<
        Array<
            ReviewSessionRecord & {
                sectionCount: number;
                unresolvedCount: number;
            }
        >
    > {
        const result = await db.query(
            `SELECT
                s.*,
                (SELECT COUNT(*) FROM mapping_review_sections sec
                 WHERE sec.review_session_id = s.id) AS section_count,
                (SELECT COUNT(*) FROM mapping_review_decisions d
                 JOIN mapping_review_sections sec ON sec.id = d.section_id
                 WHERE sec.review_session_id = s.id
                   AND d.decision = 'UNRESOLVED') AS unresolved_count
             FROM mapping_review_sessions s
             ORDER BY s.created_at DESC
             LIMIT $1`,
            [limit],
        );

        return result.rows.map((row: any) => ({
            ...mapSessionRow(row),
            sectionCount: Number(row.section_count),
            unresolvedCount: Number(row.unresolved_count),
        }));
    }

    /**
     * Record or update the human decision for one column mapping.
     *
     * Idempotent by the mapping_review_decisions_section_column_key
     * unique constraint: at most one decision row per column per
     * section; repeated decisions UPSERT the same row (no duplicates).
     * All validation reads happen inside the same transaction as the
     * write, avoiding race-prone read-then-write behavior.
     */
    async updateMappingDecision(input: {
        sessionId: string;
        sectionId: string;
        sourceColumn: string;
        decision: ResolvableDecision;
        approvedField?: string | null;
        reviewNote?: string | null;
        reviewedBy?: string | null;
    }): Promise<MappingDecisionRecord> {
        const { sessionId, sectionId, sourceColumn } =
            input;

        return db.transaction(async client => {
            const sessionRow = await client.query(
                `SELECT * FROM mapping_review_sessions
                 WHERE id = $1 FOR UPDATE`,
                [sessionId],
            );

            const session = sessionRow.rows[0];

            if (!session) {
                throw new ReviewSessionError(
                    "SESSION_NOT_FOUND",
                    `Review session ${sessionId} not found.`,
                );
            }

            if (
                session.status === "APPROVED" ||
                session.status === "REJECTED"
            ) {
                throw new ReviewSessionError(
                    "SESSION_IMMUTABLE",
                    `Review session is ${session.status}; mapping decisions can no longer change.`,
                );
            }

            const sectionRow = await client.query(
                `SELECT * FROM mapping_review_sections
                 WHERE id = $1 AND review_session_id = $2`,
                [sectionId, sessionId],
            );

            const section = sectionRow.rows[0];

            if (!section) {
                throw new ReviewSessionError(
                    "SECTION_NOT_FOUND",
                    `Section ${sectionId} does not belong to session ${sessionId}.`,
                );
            }

            if (section.status !== "IN_REVIEW") {
                throw new ReviewSessionError(
                    "SESSION_IMMUTABLE",
                    `Section is ${section.status}; mapping decisions can no longer change.`,
                );
            }

            const snapshot: MappingSectionPreview | null =
                session.preview_snapshot?.sections?.[
                    section.section_index
                ] ?? null;

            const snapshotColumn = snapshot
                ? findSnapshotColumn(
                        snapshot,
                        sourceColumn,
                    )
                : null;

            if (!snapshotColumn) {
                throw new ReviewSessionError(
                    "COLUMN_NOT_IN_SNAPSHOT",
                    `Column "${sourceColumn}" does not exist in the stored preview snapshot for this section.`,
                );
            }

            let approvedField: string | null = null;

            switch (input.decision) {
                case "ACCEPT": {
                    if (
                        input.approvedField != null &&
                        input.approvedField !==
                            snapshotColumn.proposedField
                    ) {
                        throw new ReviewSessionError(
                            "PROPOSAL_MISMATCH",
                            `ACCEPT requires approvedField to match the original proposal ("${snapshotColumn.proposedField}").`,
                        );
                    }

                    if (
                        snapshotColumn.proposedField ===
                        null
                    ) {
                        throw new ReviewSessionError(
                            "PROPOSAL_MISMATCH",
                            "ACCEPT is not possible: the original proposal had no field.",
                        );
                    }

                    approvedField =
                        snapshotColumn.proposedField;

                    break;
                }

                case "CHANGE": {
                    const target =
                        input.approvedField;

                    if (
                        !target ||
                        !REVIEWABLE_CANONICAL_FIELDS.has(
                            target,
                        )
                    ) {
                        throw new ReviewSessionError(
                            "INVALID_FIELD",
                            `CHANGE requires a supported canonical field (one of: ${Array.from(REVIEWABLE_CANONICAL_FIELDS).sort().join(", ")}).`,
                        );
                    }

                    approvedField = target;

                    break;
                }

                case "REJECT": {
                    if (
                        input.approvedField != null &&
                        input.approvedField !== ""
                    ) {
                        throw new ReviewSessionError(
                            "INVALID_FIELD",
                            "REJECT must not carry an approvedField.",
                        );
                    }

                    approvedField = null;

                    break;
                }
            }

            const decisionRow = await client.query(
                `INSERT INTO mapping_review_decisions (
                    section_id,
                    source_column,
                    proposed_field,
                    approved_field,
                    decision,
                    original_confidence,
                    original_confidence_level,
                    mapping_conflict,
                    review_note,
                    reviewed_by,
                    reviewed_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
                ON CONFLICT (section_id, source_column)
                DO UPDATE SET
                    approved_field = EXCLUDED.approved_field,
                    decision = EXCLUDED.decision,
                    review_note = EXCLUDED.review_note,
                    reviewed_by = EXCLUDED.reviewed_by,
                    reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *`,
                [
                    sectionId,
                    sourceColumn,
                    snapshotColumn.proposedField,
                    approvedField,
                    input.decision,
                    snapshotColumn.confidence,
                    snapshotColumn.confidenceLevel,
                    snapshotColumn.mappingConflict ?? null,
                    input.reviewNote ?? null,
                    input.reviewedBy ?? null,
                ],
            );

            await client.query(
                `UPDATE mapping_review_sessions
                 SET status = 'IN_REVIEW'
                 WHERE id = $1 AND status = 'DRAFT'`,
                [sessionId],
            );

            return mapDecisionRow(
                decisionRow.rows[0],
            );
        });
    }

    /**
     * Approve a section. Allowed only when every column that requires a
     * decision (snapshot reviewRequired, or carrying a conflict) has a
     * resolved human decision.
     */
    async approveSection(input: {
        sessionId: string;
        sectionId: string;
        reviewedBy?: string | null;
    }): Promise<ReviewSectionRecord> {
        return db.transaction(async client => {
            const sectionRow = await client.query(
                `SELECT sec.*, sess.status AS session_status,
                        sess.preview_snapshot
                 FROM mapping_review_sections sec
                 JOIN mapping_review_sessions sess
                   ON sess.id = sec.review_session_id
                 WHERE sec.id = $1 AND sec.review_session_id = $2
                 FOR UPDATE OF sec`,
                [input.sectionId, input.sessionId],
            );

            const section = sectionRow.rows[0];

            if (!section) {
                throw new ReviewSessionError(
                    "SECTION_NOT_FOUND",
                    `Section ${input.sectionId} does not belong to session ${input.sessionId}.`,
                );
            }

            if (
                section.session_status === "APPROVED" ||
                section.session_status === "REJECTED"
            ) {
                throw new ReviewSessionError(
                    "SESSION_IMMUTABLE",
                    `Review session is ${section.session_status}; sections can no longer change.`,
                );
            }

            const snapshot: MappingSectionPreview | null =
                section.preview_snapshot?.sections?.[
                    section.section_index
                ] ?? null;

            if (!snapshot) {
                throw new ReviewSessionError(
                    "PREVIEW_MISMATCH",
                    "Stored preview snapshot is missing this section.",
                );
            }

            const decisionRows = await client.query(
                `SELECT * FROM mapping_review_decisions
                 WHERE section_id = $1`,
                [input.sectionId],
            );

            const decisionByColumn = new Map(
                decisionRows.rows.map(row => [
                    row.source_column,
                    row,
                ]),
            );

            for (const column of snapshot.columns) {
                const decision =
                    decisionByColumn.get(
                        column.sourceColumn,
                    );

                const requiresDecision =
                    column.reviewRequired ||
                    column.mappingConflict !== null;

                if (
                    requiresDecision &&
                    (!decision ||
                        decision.decision ===
                            "UNRESOLVED")
                ) {
                    throw new ReviewSessionError(
                        "SECTION_HAS_UNRESOLVED",
                        `Section cannot be approved: column "${column.sourceColumn}" still requires a human decision.`,
                    );
                }
            }

            const updated = await client.query(
                `UPDATE mapping_review_sections
                 SET status = 'APPROVED',
                     reviewed_at = CURRENT_TIMESTAMP,
                     reviewed_by = $2
                 WHERE id = $1
                 RETURNING *`,
                [
                    input.sectionId,
                    input.reviewedBy ?? null,
                ],
            );

            return mapSectionRow(updated.rows[0]);
        });
    }

    /**
     * Reject a section (terminal for the section; no import semantics).
     */
    async rejectSection(input: {
        sessionId: string;
        sectionId: string;
        reviewedBy?: string | null;
    }): Promise<ReviewSectionRecord> {
        return db.transaction(async client => {
            const updated = await client.query(
                `UPDATE mapping_review_sections sec
                 SET status = 'REJECTED',
                     reviewed_at = CURRENT_TIMESTAMP,
                     reviewed_by = $3
                 FROM mapping_review_sessions sess
                 WHERE sec.id = $1
                   AND sec.review_session_id = $2
                   AND sess.status NOT IN ('APPROVED', 'REJECTED')
                 RETURNING sec.*`,
                [
                    input.sectionId,
                    input.sessionId,
                    input.reviewedBy ?? null,
                ],
            );

            if (!updated.rows[0]) {
                throw new ReviewSessionError(
                    "SECTION_NOT_FOUND",
                    "Section cannot be rejected (not found, or session already APPROVED/REJECTED).",
                );
            }

            return mapSectionRow(
                updated.rows[0],
            );
        });
    }

    /**
     * Approve the whole session. Allowed only when ALL sections are
     * APPROVED and no mapping decision remains unresolved.
     */
    async approveReviewSession(input: {
        sessionId: string;
        reviewedBy?: string | null;
    }): Promise<ReviewSessionRecord> {
        return db.transaction(async client => {
            const sessionRow = await client.query(
                `SELECT * FROM mapping_review_sessions
                 WHERE id = $1 FOR UPDATE`,
                [input.sessionId],
            );

            const session = sessionRow.rows[0];

            if (!session) {
                throw new ReviewSessionError(
                    "SESSION_NOT_FOUND",
                    `Review session ${input.sessionId} not found.`,
                );
            }

            if (
                session.status === "APPROVED" ||
                session.status === "REJECTED"
            ) {
                throw new ReviewSessionError(
                    "SESSION_IMMUTABLE",
                    `Review session is already ${session.status}.`,
                );
            }

            /*
             * Every section must be resolved: APPROVED or REJECTED both
             * count as resolved (a rejection is an explicit human decision
             * that the section is unusable); only IN_REVIEW blocks.
             */
            const unresolvedSections =
                await client.query(
                    `SELECT COUNT(*)::int AS count
                     FROM mapping_review_sections
                     WHERE review_session_id = $1
                       AND status = 'IN_REVIEW'`,
                    [input.sessionId],
                );

            if (
                Number(
                    unresolvedSections.rows[0]
                        .count,
                ) > 0
            ) {
                throw new ReviewSessionError(
                    "SESSION_HAS_UNRESOLVED",
                    `Session cannot be approved: ${unresolvedSections.rows[0].count} section(s) remain IN_REVIEW.`,
                );
            }

            /*
             * Required column decisions must be resolved in every APPROVED
             * section. A REJECTED section's unresolved columns are moot:
             * the human's section-level rejection IS the resolution.
             */
            const unresolved = await client.query(
                `SELECT COUNT(*)::int AS count
                 FROM mapping_review_sections sec
                 JOIN mapping_review_decisions d
                   ON d.section_id = sec.id
                 WHERE sec.review_session_id = $1
                   AND sec.status = 'APPROVED'
                   AND d.decision = 'UNRESOLVED'
                   AND d.review_required`,
                [input.sessionId],
            );

            if (
                Number(
                    unresolved.rows[0].count,
                ) > 0
            ) {
                throw new ReviewSessionError(
                    "SESSION_HAS_UNRESOLVED",
                    `Session cannot be approved: ${unresolved.rows[0].count} required mapping decision(s) remain unresolved in approved sections.`,
                );
            }

            const updated = await client.query(
                `UPDATE mapping_review_sessions
                 SET status = 'APPROVED',
                     reviewed_by = $2,
                     reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [
                    input.sessionId,
                    input.reviewedBy ?? null,
                ],
            );

            return mapSessionRow(
                updated.rows[0],
            );
        });
    }

    /**
     * Reject the whole session (terminal; no import semantics).
     */
    async rejectReviewSession(input: {
        sessionId: string;
        reviewedBy?: string | null;
    }): Promise<ReviewSessionRecord> {
        const updated = await db.query(
            `UPDATE mapping_review_sessions
             SET status = 'REJECTED',
                 reviewed_by = $2,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status NOT IN ('APPROVED', 'REJECTED')
             RETURNING *`,
            [input.sessionId, input.reviewedBy ?? null],
        );

        if (!updated.rows[0]) {
            throw new ReviewSessionError(
                "SESSION_IMMUTABLE",
                "Review session cannot be rejected (not found, or already APPROVED/REJECTED).",
            );
        }

        return mapSessionRow(updated.rows[0]);
    }

    /**
     * Verify the reviewed source file still matches the session's
     * stored checksum. A changed file must never silently reuse the
     * reviewed session. Read-only: performs no writes.
     */
    async verifySourceIntegrity(
        sessionId: string,
    ): Promise<{
        sessionId: string;
        storedChecksum: string;
        currentChecksum: string | null;
        matches: boolean;
    }> {
        const sessionRow = await db.query(
            `SELECT id, source_checksum, source_file_path
             FROM mapping_review_sessions WHERE id = $1`,
            [sessionId],
        );

        const session = sessionRow.rows[0];

        if (!session) {
            throw new ReviewSessionError(
                "SESSION_NOT_FOUND",
                `Review session ${sessionId} not found.`,
            );
        }

        let currentChecksum: string | null = null;

        try {
            currentChecksum = crypto
                .createHash("sha256")
                .update(
                    fs.readFileSync(
                        session.source_file_path,
                    ),
                )
                .digest("hex");
        } catch {
            currentChecksum = null;
        }

        return {
            sessionId: session.id,
            storedChecksum: session.source_checksum,
            currentChecksum,
            matches:
                currentChecksum !== null &&
                currentChecksum ===
                    session.source_checksum,
        };
    }
}

export const mappingReviewSessionService =
    new MappingReviewSessionService();
