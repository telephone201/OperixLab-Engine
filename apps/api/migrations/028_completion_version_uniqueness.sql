-- Migration 028: Completion Version Uniqueness
-- Prevents duplicate completion reviews and closure snapshots for the same project/version.

CREATE UNIQUE INDEX IF NOT EXISTS ux_completion_reviews_project_version
    ON completion_reviews(project_id, completion_version);

CREATE UNIQUE INDEX IF NOT EXISTS ux_project_closure_snapshots_project_version
    ON project_closure_snapshots(project_id, completion_version);
