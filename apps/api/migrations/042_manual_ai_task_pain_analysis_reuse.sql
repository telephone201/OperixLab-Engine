-- Migration 042: Allow Pain Analysis reuse across Manual AI lifecycle tasks
--
-- manual_ai_tasks.pain_analysis_id is a lifecycle correlation reference.
-- A persisted Pain Analysis may be referenced by multiple downstream
-- Manual AI tasks (for example PAIN_ANALYSIS and REQUIREMENTS_EXTRACTION).
--
-- Migration 037 incorrectly enforced one-to-one cardinality by creating
-- a UNIQUE index on pain_analysis_id. This migration removes that
-- uniqueness while preserving indexed lookup performance.
--
-- No business data is modified.

DROP INDEX IF EXISTS ux_manual_ai_tasks_pain_analysis;

CREATE INDEX IF NOT EXISTS idx_manual_ai_tasks_pain_analysis
    ON manual_ai_tasks(pain_analysis_id);
