-- Migration 015: Phase 10 Client Review and Acceptance
-- Implements persistence for review sessions, items, feedback, findings, and acceptance decisions.

CREATE TABLE IF NOT EXISTS review_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_baseline_id UUID NOT NULL REFERENCES scope_baselines(id),
    delivery_plan_version_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    workflow_version_id UUID NOT NULL,
    review_version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'READY_FOR_REVIEW', 'IN_REVIEW', 'CHANGES_REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id UUID NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
    scope_item_id UUID REFERENCES scope_items(id),
    delivery_task_id UUID,
    milestone_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    expected_outcome TEXT,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'PASS', 'FAIL', 'NOT_APPLICABLE', 'BLOCKED'
    evidence_required BOOLEAN DEFAULT TRUE,
    evidence_reference TEXT,
    reviewer_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id UUID NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
    review_item_id UUID REFERENCES review_items(id),
    submitted_by UUID NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    comment TEXT NOT NULL,
    classification VARCHAR(50) NOT NULL, -- 'COMMENT', 'QUESTION', 'ISSUE', 'CHANGE_REQUEST', 'APPROVAL_NOTE'
    severity VARCHAR(20) NOT NULL, -- 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    attachment_reference TEXT,
    status VARCHAR(50) DEFAULT 'NEW'
);

CREATE TABLE IF NOT EXISTS review_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id UUID NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL, -- 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status VARCHAR(50) NOT NULL, -- 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'
    evidence TEXT,
    owner UUID,
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS acceptance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id UUID NOT NULL REFERENCES review_sessions(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    scope_baseline_id UUID NOT NULL REFERENCES scope_baselines(id),
    delivery_plan_version_id UUID NOT NULL,
    decision VARCHAR(50) NOT NULL, -- 'ACCEPTED', 'REJECTED', 'CONDITIONAL_ACCEPTANCE'
    decided_by UUID NOT NULL,
    decided_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    scope_hash VARCHAR(64),
    review_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_rev_project ON review_sessions(project_id);
CREATE INDEX idx_ri_session ON review_items(review_session_id);
CREATE INDEX idx_rf_session ON review_feedback(review_session_id);
CREATE INDEX idx_rfnd_session ON review_findings(review_session_id);
CREATE INDEX idx_acc_project ON acceptance_records(project_id);
