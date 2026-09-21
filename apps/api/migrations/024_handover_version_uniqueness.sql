-- Migration 024: Handover Version Uniqueness
-- Prevents duplicate handover versions for the same project.

CREATE UNIQUE INDEX IF NOT EXISTS ux_handovers_project_version
    ON handovers(project_id, handover_version);
