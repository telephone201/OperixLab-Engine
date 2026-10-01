-- Migration 036: Research identity (Option A)
-- Persists the canonical link research_data.research_version_id ->
-- research_versions(id) so that research_data, research_versions, research and
-- research_evidence always belong to the same Research submission.
-- Historical rows stay NULL: correct NULL over an incorrect guessed link.
-- No temporal inference (created_at) is used anywhere in this migration.

ALTER TABLE research_data
    ADD COLUMN IF NOT EXISTS research_version_id UUID;

ALTER TABLE research_data
    DROP CONSTRAINT IF EXISTS research_data_research_version_id_fkey;

ALTER TABLE research_data
    ADD CONSTRAINT research_data_research_version_id_fkey
    FOREIGN KEY (research_version_id)
    REFERENCES research_versions(id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_research_data_research_version
    ON research_data(research_version_id);

-- Deterministic backfill, restricted to provably unambiguous companies:
--   * the research_data row resolves to exactly one company through the stored
--     FK chain research_data.request_id -> research_requests.lead_id ->
--     leads.company_id (no JSONB paths, no timestamps), and
--   * that company has EXACTLY ONE research row and EXACTLY ONE research_data
--     row, and that single research has EXACTLY ONE research_version.
-- One submission always writes exactly one research + one research_data row,
-- so a 1:1 company scope proves both rows belong to the same submission.
-- Every ambiguous company is deliberately left NULL.
WITH candidates AS (
    SELECT
        rd.id AS research_data_id,
        l.company_id AS company_id
    FROM research_data rd
    JOIN research_requests rr ON rr.id = rd.request_id
    JOIN leads l ON l.id = rr.lead_id
    WHERE l.company_id IS NOT NULL
      AND rd.research_version_id IS NULL
),
data_per_company AS (
    SELECT l.company_id AS company_id, COUNT(rd.id) AS data_count
    FROM research_data rd
    JOIN research_requests rr ON rr.id = rd.request_id
    JOIN leads l ON l.id = rr.lead_id
    WHERE l.company_id IS NOT NULL
    GROUP BY l.company_id
),
research_per_company AS (
    SELECT r.company_id AS company_id, COUNT(*) AS research_count
    FROM research r
    GROUP BY r.company_id
)
UPDATE research_data rd
SET research_version_id = rv.id
FROM candidates c
JOIN data_per_company dc
    ON dc.company_id = c.company_id AND dc.data_count = 1
JOIN research_per_company rc
    ON rc.company_id = c.company_id AND rc.research_count = 1
JOIN research r
    ON r.company_id = c.company_id
JOIN research_versions rv
    ON rv.research_id = r.id
WHERE rd.id = c.research_data_id
  AND rv.is_current = true
  AND (SELECT COUNT(*) FROM research_versions v2 WHERE v2.research_id = r.id) = 1;

-- Unique 1:1 link, applied only when existing data is compatible. NULLs may
-- repeat. If conflicting data exists the index is skipped with a notice
-- instead of failing the migration.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM research_data
        WHERE research_version_id IS NOT NULL
        GROUP BY research_version_id
        HAVING COUNT(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_research_data_research_version
            ON research_data(research_version_id);
    ELSE
        RAISE NOTICE 'Skipped unique index on research_data.research_version_id: duplicate values present';
    END IF;
END $$;
