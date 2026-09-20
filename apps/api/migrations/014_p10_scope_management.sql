-- Migration 014: Phase 10 Scope Management & Change Requests
-- Implements persistence for requirements confirmation, scope baselines, and change requests.

CREATE TABLE IF NOT EXISTS requirements_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    solution_architecture_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    requirements_version_id UUID NOT NULL,
    delivery_plan_version_id UUID NOT NULL,
    confirmation_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'SUPERSEDED', 'CANCELLED'
    confirmed_by UUID,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements_confirmation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    confirmation_id UUID NOT NULL REFERENCES requirements_confirmations(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL,
    classification VARCHAR(50) NOT NULL, -- 'INCLUDED', 'OPTIONAL', 'OUT_OF_SCOPE', 'UNRESOLVED'
    priority VARCHAR(20),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scope_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    confirmation_id UUID NOT NULL REFERENCES requirements_confirmations(id),
    solution_version_id UUID NOT NULL,
    delivery_plan_version_id UUID NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'SUPERSEDED', 'ARCHIVED'
    created_by UUID NOT NULL,
    confirmed_by UUID,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    superseded_at TIMESTAMP WITH TIME ZONE,
    content_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scope_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_baseline_id UUID NOT NULL REFERENCES scope_baselines(id) ON DELETE CASCADE,
    source_requirement_id UUID,
    title TEXT,
    description TEXT,
    classification VARCHAR(50) NOT NULL, -- 'INCLUDED', 'OPTIONAL', 'OUT_OF_SCOPE'
    priority VARCHAR(20),
    delivery_reference TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_baseline_id UUID NOT NULL REFERENCES scope_baselines(id),
    requested_by UUID NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reason TEXT,
    classification VARCHAR(50) NOT NULL, -- 'SCOPE_ADDITION', 'SCOPE_REMOVAL', etc.
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'SUBMITTED', 'APPROVED', etc.
    impact_status VARCHAR(50) DEFAULT 'PENDING',
    technical_impact VARCHAR(50) DEFAULT 'UNKNOWN',
    commercial_impact VARCHAR(50) DEFAULT 'UNKNOWN',
    schedule_impact VARCHAR(50) DEFAULT 'UNKNOWN',
    risk_level VARCHAR(50) DEFAULT 'UNKNOWN',
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID,
    rejected_at TIMESTAMP WITH TIME ZONE,
    decision_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS change_request_impact_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
    requirements_impact TEXT,
    scope_impact TEXT,
    solution_impact TEXT,
    workflow_impact TEXT,
    delivery_plan_impact TEXT,
    schedule_impact TEXT,
    commercial_impact TEXT,
    technical_impact TEXT,
    risk_impact TEXT,
    affected_items TEXT[],
    recommendation TEXT,
    confidence VARCHAR(50),
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    analyzed_by UUID NOT NULL
);

-- Indexes
CREATE INDEX idx_rc_project ON requirements_confirmations(project_id);
CREATE INDEX idx_sb_project ON scope_baselines(project_id);
CREATE INDEX idx_si_baseline ON scope_items(scope_baseline_id);
CREATE INDEX idx_cr_project ON change_requests(project_id);
CREATE INDEX idx_cra_cr ON change_request_impact_analysis(change_request_id);

-- ============================================================
-- Reconciliation: legacy change_requests
-- ============================================================

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS scope_baseline_id UUID;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS requested_by UUID;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS title VARCHAR(255);

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS classification VARCHAR(50);

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS impact_status VARCHAR(50) DEFAULT 'PENDING';

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS technical_impact VARCHAR(50) DEFAULT 'UNKNOWN';

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS commercial_impact VARCHAR(50) DEFAULT 'UNKNOWN';

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS schedule_impact VARCHAR(50) DEFAULT 'UNKNOWN';

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50) DEFAULT 'UNKNOWN';

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS approved_by UUID;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS rejected_by UUID;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS decision_reason TEXT;

ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_cr_project ON change_requests(project_id);
