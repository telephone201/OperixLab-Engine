-- Migration 037: Manual AI task pain identity links
-- Adds research_version_id, qualification_version_id, and pain_analysis_id
-- to manual_ai_tasks for Pain lifecycle correlation.
-- All columns nullable. No historical backfill. Existing audit records intact.

ALTER TABLE manual_ai_tasks
    ADD COLUMN IF NOT EXISTS research_version_id UUID;

ALTER TABLE manual_ai_tasks
    ADD COLUMN IF NOT EXISTS qualification_version_id UUID;

ALTER TABLE manual_ai_tasks
    ADD COLUMN IF NOT EXISTS pain_analysis_id UUID;

ALTER TABLE manual_ai_tasks
    DROP CONSTRAINT IF EXISTS manual_ai_tasks_research_version_id_fkey;

ALTER TABLE manual_ai_tasks
    ADD CONSTRAINT manual_ai_tasks_research_version_id_fkey
    FOREIGN KEY (research_version_id)
    REFERENCES research_versions(id)
    ON DELETE SET NULL;

ALTER TABLE manual_ai_tasks
    DROP CONSTRAINT IF EXISTS manual_ai_tasks_qualification_version_id_fkey;

ALTER TABLE manual_ai_tasks
    ADD CONSTRAINT manual_ai_tasks_qualification_version_id_fkey
    FOREIGN KEY (qualification_version_id)
    REFERENCES qualifications(id)
    ON DELETE SET NULL;

ALTER TABLE manual_ai_tasks
    DROP CONSTRAINT IF EXISTS manual_ai_tasks_pain_analysis_id_fkey;

ALTER TABLE manual_ai_tasks
    ADD CONSTRAINT manual_ai_tasks_pain_analysis_id_fkey
    FOREIGN KEY (pain_analysis_id)
    REFERENCES pain_analyses(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manual_ai_tasks_research_version
    ON manual_ai_tasks(research_version_id);

CREATE INDEX IF NOT EXISTS idx_manual_ai_tasks_qualification_version
    ON manual_ai_tasks(qualification_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_manual_ai_tasks_pain_analysis
    ON manual_ai_tasks(pain_analysis_id);
