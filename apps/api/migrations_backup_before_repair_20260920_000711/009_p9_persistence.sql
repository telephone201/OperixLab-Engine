-- Phase 9 Step 1: Persistence & Immutable Workflow Versioning
-- This migration implements the data structures for tracking the implementation
-- lifecycle of workflows, from source immutable artifacts to versioned client copies.

-- 1. Workflow Artifacts
-- Represents a physical file or byte-stream of a workflow.
-- This allows us to track the exact content independently of the versioning logic.
CREATE TABLE IF NOT EXISTS workflow_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 of raw bytes
    content_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,       -- Path relative to workflow-library/artifacts/
    content_format VARCHAR(50) DEFAULT 'json',
    is_immutable BOOLEAN DEFAULT FALSE, -- True for original source artifacts
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX idx_workflow_artifacts_hash ON workflow_artifacts(content_hash);

-- 2. Workflow Versions
-- The core versioning entity. Implements the version chain.
CREATE TABLE IF NOT EXISTS workflow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_source_id UUID REFERENCES workflow_library(id), -- Reference to the original library item
    solution_id UUID NOT NULL,                           -- The solution this version belongs to
    parent_version_id UUID REFERENCES workflow_versions(id), -- The previous version in the chain
    version_number INT NOT NULL,                         -- Deterministic incremental number (1, 2, 3...)
    artifact_id UUID REFERENCES workflow_artifacts(id),     -- The actual content
    content_hash VARCHAR(64) NOT NULL,                    -- Redundant hash for quick verification
    status VARCHAR(50) DEFAULT 'DRAFT',                  -- DRAFT, FINALIZED, SUPERSEDED, ARCHIVED
    origin_type VARCHAR(50) NOT NULL,                     -- REUSED, CUSTOMIZED, COMPOSED, CUSTOM_BUILT
    change_summary TEXT,
    is_immutable BOOLEAN DEFAULT FALSE,                  -- Becomes true when status = 'FINALIZED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,

    -- Ensure version numbering is unique within a specific solution/workflow chain
    UNIQUE (solution_id, workflow_source_id, version_number)
);

CREATE INDEX idx_workflow_versions_solution ON workflow_versions(solution_id);
CREATE INDEX idx_workflow_versions_parent ON workflow_versions(parent_version_id);
CREATE INDEX idx_workflow_versions_hash ON workflow_versions(content_hash);

-- 3. Workflow Version Sources (For Composed Workflows)
-- Handles the many-to-many relationship between a composed version and its source components.
CREATE TABLE IF NOT EXISTS workflow_version_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE CASCADE,
    source_workflow_id UUID REFERENCES workflow_library(id),
    source_role VARCHAR(100), -- e.g., 'TRIGGER', 'PROCESSOR', 'SINK'
    source_hash VARCHAR(64),  -- The hash of the source at the time of composition
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wv_sources_version ON workflow_version_sources(workflow_version_id);
CREATE INDEX idx_wv_sources_source ON workflow_version_sources(source_workflow_id);

-- 4. Implementation Plans
-- Tracks the transformation process from Blueprint to Version.
CREATE TABLE IF NOT EXISTS implementation_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL,
    solution_version_id UUID NOT NULL, -- FK to solution_versions
    status VARCHAR(50) DEFAULT 'PLANNING', -- PLANNING, IMPLEMENTING, VALIDATING, COMPLETED, FAILED
    architect_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_impl_plans_solution ON implementation_plans(solution_id);

-- 5. Validation Runs (Preliminary structure for Step 1 metadata)
-- Allows tracking of the integrity checks performed during version creation.
CREATE TABLE IF NOT EXISTS workflow_validation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES workflow_versions(id) ON DELETE CASCADE,
    layer VARCHAR(50), -- Structural, Dependency, Data, Security, Business, Operational
    result VARCHAR(50), -- PASS, FAIL, WARN, UNKNOWN
    logs TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_val_runs_version ON workflow_validation_runs(version_id);
