-- Migration 038: DB contract repair (STEP 9 / Gate G2)
--
-- Repairs three database contract gaps identified by the STEP 9 Phase 1
-- audit, WITHOUT touching any business data:
--
--   A. solution_versions   -> normalize the legacy 001 shape (empty table)
--                             to the intended matching-era contract (008 intent).
--   B. workflow_versions   -> add the missing FK
--                             solution_id -> solution_architectures(id).
--   C. commercial_packages -> DB-enforced idempotency invariant for the
--                             Step 7 handoff: UNIQUE (lead_id, solution_version_id).
--
-- SAFETY CONTRACT (enforced INSIDE this migration):
--   * A1: solution_versions MUST contain zero rows before destructive
--         normalization; otherwise the migration aborts.
--   * B1: workflow_versions MUST contain zero orphan solution_id references
--         before the FK is added; otherwise the migration aborts with the
--         orphan count. Existing rows are never rewritten.
--   * C1: commercial_packages MUST contain zero duplicate
--         (lead_id, solution_version_id) pairs before the unique index is
--         created; otherwise the migration aborts. No rows are deleted or
--         merged.
--   * The runner executes each migration inside a single transaction, so any
--     abort rolls back the entire file atomically (no half-migrated state).
--
-- FRESH INSTALLS: 001 creates the legacy solution_versions shape (empty),
-- 038 then normalizes it, so the 001..038 sequence converges to exactly the
-- intended final contract. Historical migrations 001/008 are intentionally
-- left untouched (forward repair only).
--
-- workflow_library is not referenced or modified by this migration.

-- ===========================================================================
-- A. solution_versions normalization (intended contract)
--    solution_id UUID NOT NULL -> solution_architectures(id) ON DELETE CASCADE
--    version INT NOT NULL
--    config_snapshot JSONB
--    UNIQUE (solution_id, version)
-- ===========================================================================

DO $$
DECLARE
    sv_row_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO sv_row_count FROM solution_versions;

    IF sv_row_count <> 0 THEN
        RAISE EXCEPTION
            'G2_DB_CONTRACT_REPAIR_ABORTED: solution_versions is expected to be empty before normalization (found % rows). Resolve the table contents before applying migration 038.',
            sv_row_count;
    END IF;

    -- Legacy FK from the 001 shape (solution_versions_solution_id_fkey
    -- -> solutions(id)); dropped and recreated against the canonical model
    -- under the repository's standard <table>_<column>_fkey name.
    ALTER TABLE solution_versions
        DROP CONSTRAINT IF EXISTS solution_versions_solution_id_fkey;

    -- Legacy columns that are not part of the intended contract
    -- (001-era: version_number VARCHAR / json_config TEXT / changelog TEXT).
    ALTER TABLE solution_versions DROP COLUMN IF EXISTS version_number;
    ALTER TABLE solution_versions DROP COLUMN IF EXISTS json_config;
    ALTER TABLE solution_versions DROP COLUMN IF EXISTS changelog;

    ALTER TABLE solution_versions
        ALTER COLUMN solution_id SET NOT NULL;

    ALTER TABLE solution_versions
        ALTER COLUMN version SET NOT NULL;

    ALTER TABLE solution_versions
        ADD CONSTRAINT solution_versions_solution_id_fkey
        FOREIGN KEY (solution_id)
        REFERENCES solution_architectures(id)
        ON DELETE CASCADE;

    ALTER TABLE solution_versions
        ADD CONSTRAINT ux_solution_versions_solution_id_version
        UNIQUE (solution_id, version);
END $$;

-- ===========================================================================
-- B. workflow_versions.solution_id -> solution_architectures(id)
--    Abort on orphans; never rewrite existing rows.
-- ===========================================================================

DO $$
DECLARE
    orphan_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO orphan_count
      FROM workflow_versions wv
      LEFT JOIN solution_architectures sa ON sa.id = wv.solution_id
     WHERE wv.solution_id IS NOT NULL
       AND sa.id IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION
            'G2_DB_CONTRACT_REPAIR_ABORTED: workflow_versions contains % orphan solution_id reference(s) that do not resolve to solution_architectures(id). Reparent or explicitly remove the orphaned verification-residue rows before applying migration 038.',
            orphan_count;
    END IF;

    -- NOT VALID first (no long scan against existing rows), then validated so
    -- the final constraint is fully valid, per the repository convention.
    ALTER TABLE workflow_versions
        ADD CONSTRAINT workflow_versions_solution_id_fkey
        FOREIGN KEY (solution_id)
        REFERENCES solution_architectures(id)
        ON DELETE CASCADE
        NOT VALID;

    ALTER TABLE workflow_versions
        VALIDATE CONSTRAINT workflow_versions_solution_id_fkey;
END $$;

-- ===========================================================================
-- C. commercial_packages idempotency invariant (Step 7 handoff)
--    UNIQUE (lead_id, solution_version_id)
-- ===========================================================================

DO $$
DECLARE
    duplicate_group_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO duplicate_group_count
      FROM (
          SELECT lead_id, solution_version_id
            FROM commercial_packages
           GROUP BY lead_id, solution_version_id
          HAVING COUNT(*) > 1
      ) duplicates;

    IF duplicate_group_count > 0 THEN
        RAISE EXCEPTION
            'G2_DB_CONTRACT_REPAIR_ABORTED: commercial_packages contains % duplicate (lead_id, solution_version_id) group(s). Deduplicate explicitly before applying migration 038 (no automatic deletion or merging is performed).',
            duplicate_group_count;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_packages_lead_id_solution_version_id
        ON commercial_packages (lead_id, solution_version_id);
END $$;
