-- Migration 017: Phase 10 Project Completion and Closure
-- Implements persistence for completion readiness, reviews, and final closure snapshots.

CREATE TABLE IF NOT EXISTS completion_readiness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    handover_id UUID REFERENCES handovers(id),
    acceptance_id UUID REFERENCES acceptance_records(id),
    scope_version_id UUID,
    delivery_plan_version_id UUID,
    support_transition_id UUID,
    status VARCHAR(50) NOT NULL, -- 'NOT_READY', 'READY', 'BLOCKED', 'REQUIRES_REVIEW'
    evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    evaluated_by UUID NOT NULL,
    rules_version VARCHAR(50) NOT NULL,
    blocking_reasons TEXT[],
    warnings TEXT[],
    evidence_references TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS completion_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    completion_readiness_id UUID NOT NULL REFERENCES completion_readiness(id),
    completion_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'READY', 'IN_REVIEW', 'APPROVED', 'REJECTED'
    reviewed_by UUID NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    decision VARCHAR(50) NOT NULL, -- 'PENDING', 'APPROVED', 'REJECTED'
    reason TEXT,
    evidence_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS completion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completion_review_id UUID NOT NULL REFERENCES completion_reviews(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    required BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'COMPLETED', 'BLOCKED', 'WAIVED'
    evidence_reference TEXT,
    owner UUID,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS project_closure_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    acceptance_id UUID,
    scope_version_id UUID,
    delivery_plan_version_id UUID,
    solution_version_id UUID,
    workflow_version_id UUID,
    handover_id UUID,
    support_transition_id UUID,
    completion_review_id UUID NOT NULL REFERENCES completion_reviews(id),
    completion_version INTEGER NOT NULL,
    completion_date TIMESTAMP WITH TIME ZONE NOT NULL,
    closure_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cr_project ON completion_readiness(project_id);
CREATE INDEX idx_crev_project ON completion_reviews(project_id);
CREATE INDEX idx_pcs_project ON project_closure_snapshots(project_id);
