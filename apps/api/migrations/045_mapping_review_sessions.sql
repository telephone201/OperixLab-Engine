-- Migration 045: Mapping Review Session for purchased external lead ingestion
--
-- Purpose
--   Persistent review sessions that convert Mapping Preview proposals into
--   explicit HUMAN decisions, preserving the strict distinction between
--   system proposals (immutable snapshot evidence) and human decisions.
--
-- What this migration deliberately does NOT do:
--   - No import path: nothing here writes companies/contacts/leads or
--     raw_lead_staging. Approval is a review-workflow state only.
--   - No duplication of the ingestion_batches concept: sessions reference
--     the reviewed file through source checksum + path + optional batch.
--   - No collision with the matching-era review_sessions table.
--
-- Conventions follow migration 044 (UUID PKs, TIMESTAMPTZ, VARCHAR status
-- columns with CHECK constraints, app_users created_by FK, JSONB snapshots,
-- partial indexes, IF NOT EXISTS).

-- ============================================================
-- 1. Mapping review sessions (one per reviewed source file)
-- ============================================================

CREATE TABLE IF NOT EXISTS mapping_review_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_name  VARCHAR(255) NOT NULL,
    source_file_path  TEXT NOT NULL,
    source_checksum   CHAR(64) NOT NULL, -- sha256 hex
    batch_id          UUID, -- optional correlation to ingestion_batches
    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    preview_snapshot  JSONB NOT NULL, -- immutable mapping preview evidence
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by       UUID,
    reviewed_at       TIMESTAMPTZ,

    CONSTRAINT mapping_review_sessions_status_check
        CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')),

    CONSTRAINT mapping_review_sessions_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES app_users(id)
        ON DELETE SET NULL,

    CONSTRAINT mapping_review_sessions_reviewed_by_fkey
        FOREIGN KEY (reviewed_by)
        REFERENCES app_users(id)
        ON DELETE SET NULL,

    CONSTRAINT mapping_review_sessions_batch_id_fkey
        FOREIGN KEY (batch_id)
        REFERENCES ingestion_batches(id)
        ON DELETE SET NULL,

    -- One session per reviewed source version: a changed file (new
    -- checksum) is a different source identity and gets a fresh session.
    CONSTRAINT mapping_review_sessions_source_checksum_key
        UNIQUE (source_checksum)
);

CREATE INDEX IF NOT EXISTS idx_mapping_review_sessions_status
    ON mapping_review_sessions (status);

CREATE INDEX IF NOT EXISTS idx_mapping_review_sessions_created_at
    ON mapping_review_sessions (created_at DESC);

-- ============================================================
-- 2. Mapping review sections (one per structural section in the preview)
-- ============================================================

CREATE TABLE IF NOT EXISTS mapping_review_sections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id   UUID NOT NULL,
    section_index       INT NOT NULL,
    start_row_index     INT NOT NULL,
    end_row_index       INT NOT NULL,
    structural_pattern  VARCHAR(50) NOT NULL,
    section_type        VARCHAR(50) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'IN_REVIEW',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at         TIMESTAMPTZ,
    reviewed_by         UUID,

    CONSTRAINT mapping_review_sections_status_check
        CHECK (status IN ('IN_REVIEW', 'APPROVED', 'REJECTED')),

    CONSTRAINT mapping_review_sections_session_fkey
        FOREIGN KEY (review_session_id)
        REFERENCES mapping_review_sessions(id)
        ON DELETE CASCADE,

    -- One section row per preview section within a session.
    CONSTRAINT mapping_review_sections_session_section_key
        UNIQUE (review_session_id, section_index)
);

CREATE INDEX IF NOT EXISTS idx_mapping_review_sections_session
    ON mapping_review_sections (review_session_id);

-- ============================================================
-- 3. Mapping decisions (one per preview column, per section)
--    Original proposal evidence is preserved in the section snapshot;
--    only human decisions live here (queryable + auditable).
-- ============================================================

CREATE TABLE IF NOT EXISTS mapping_review_decisions (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id                UUID NOT NULL,
    source_column             VARCHAR(255) NOT NULL,
    proposed_field            VARCHAR(50), -- original proposal (from snapshot)
    approved_field            VARCHAR(50), -- human-selected field; null unless ACCEPT/CHANGE
    decision                  VARCHAR(20) NOT NULL DEFAULT 'UNRESOLVED',
    original_confidence       NUMERIC(4, 3),
    original_confidence_level VARCHAR(10),
    mapping_conflict          TEXT,
    review_note               TEXT,
    reviewed_by               UUID,
    reviewed_at               TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT mapping_review_decisions_decision_check
        CHECK (decision IN ('UNRESOLVED', 'ACCEPT', 'CHANGE', 'REJECT')),

    -- ACCEPT/CHANGE must carry a canonical field; UNRESOLVED/REJECT never do.
    CONSTRAINT mapping_review_decisions_field_presence_check
        CHECK (
            (decision IN ('ACCEPT', 'CHANGE') AND approved_field IS NOT NULL)
            OR
            (decision IN ('UNRESOLVED', 'REJECT') AND approved_field IS NULL)
        ),

    CONSTRAINT mapping_review_decisions_section_fkey
        FOREIGN KEY (section_id)
        REFERENCES mapping_review_sections(id)
        ON DELETE CASCADE,

    -- Idempotency invariant: at most one decision per column per section.
    -- Repeated decisions UPDATE this row; no duplicate active decisions.
    CONSTRAINT mapping_review_decisions_section_column_key
        UNIQUE (section_id, source_column)
);

CREATE INDEX IF NOT EXISTS idx_mapping_review_decisions_section
    ON mapping_review_decisions (section_id);

CREATE INDEX IF NOT EXISTS idx_mapping_review_decisions_decision
    ON mapping_review_decisions (decision)
    WHERE decision <> 'UNRESOLVED';
