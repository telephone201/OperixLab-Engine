-- Migration 046: Mapping review decision "review_required" attribution
--
-- Purpose
--   Make the section-level approval rule queryable at the session level:
--   only columns that REQUIRED a human decision (snapshot reviewRequired,
--   or carrying a header/data conflict) gate session approval. Decisions
--   on never-required (SAFE) columns may remain UNRESOLVED without
--   blocking the workflow.
--
--   The requirement is already present in the immutable preview snapshot
--   (mapping_review_sessions.preview_snapshot -> sections[].columns[]
--   .reviewRequired); this migration materializes it on each decision row
--   for queryable, auditable gating (per the project's forward-only
--   migration convention; idempotent via IF NOT EXISTS).

ALTER TABLE mapping_review_decisions
    ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the stored snapshots (no-op when the table is empty).
UPDATE mapping_review_decisions d
SET review_required = true
FROM mapping_review_sections sec
JOIN mapping_review_sessions sess
    ON sess.id = sec.review_session_id
WHERE d.section_id = sec.id
    AND (
        COALESCE(
            (sess.preview_snapshot
                -> 'sections'
                -> sec.section_index
                -> 'columns'
            ) IS NOT NULL,
            false
        )
    )
    AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            sess.preview_snapshot
                -> 'sections'
                -> sec.section_index
                -> 'columns'
        ) col
        WHERE col->>'sourceColumn' = d.source_column
            AND (
                (col->>'reviewRequired')::boolean
                OR (col->>'mappingConflict') IS NOT NULL
            )
    );

CREATE INDEX IF NOT EXISTS idx_mapping_review_decisions_review_required
    ON mapping_review_decisions (review_required)
    WHERE review_required;
