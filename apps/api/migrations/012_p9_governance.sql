-- Migration 012: Governance, Approval, and Rollback Persistence
-- Implements tables for governance approvals, known-good versions, rollback operations, and lifecycle history.

CREATE TABLE IF NOT EXISTS governance_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'DEPLOYMENT', 'ACTIVATION', 'ROLLBACK'
    approval_type VARCHAR(50) NOT NULL,
    workflow_version_id UUID,
    artifact_hash VARCHAR(64),
    deployment_id UUID,
    environment VARCHAR(50),
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'
    requested_by UUID NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decided_by UUID,
    decided_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS known_good_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID NOT NULL,
    deployment_id UUID NOT NULL,
    artifact_hash VARCHAR(64) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    n8n_workflow_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'CERTIFIED', 'REVOKED'
    marked_by UUID NOT NULL,
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_by UUID,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    reason TEXT,
    UNIQUE(workflow_version_id, environment)
);

CREATE TABLE IF NOT EXISTS rollback_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    current_deployment_id UUID NOT NULL,
    target_workflow_version_id UUID NOT NULL,
    target_deployment_id UUID NOT NULL,
    environment VARCHAR(50) NOT NULL,
    n8n_workflow_id VARCHAR(255) NOT NULL,
    incident_id VARCHAR(255) NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'APPROVED', 'EXECUTING', 'VERIFIED', 'FAILED'
    requested_by UUID NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(100),
    safe_error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rollback_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rollback_id UUID NOT NULL REFERENCES rollback_operations(id),
    n8n_workflow_id VARCHAR(255) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    workflow_content_hash VARCHAR(64) NOT NULL,
    workflow_content JSONB NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_lifecycle_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    workflow_identity VARCHAR(255),
    environment VARCHAR(50),
    previous_state VARCHAR(50),
    new_state VARCHAR(50) NOT NULL,
    actor UUID NOT NULL,
    reason TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS governance_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_identity VARCHAR(255) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    lock_type VARCHAR(50) NOT NULL, -- 'DEPLOYMENT', 'ACTIVATION', 'ROLLBACK'
    locked_by UUID NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(workflow_identity, environment, lock_type)
);

-- Indexes
CREATE INDEX idx_gov_approval_entity ON governance_approvals(entity_id, approval_type);
CREATE INDEX idx_kg_version_env ON known_good_versions(workflow_version_id, environment);
CREATE INDEX idx_rb_op_deployment ON rollback_operations(current_deployment_id);
CREATE INDEX idx_lifecycle_entity ON workflow_lifecycle_transitions(entity_id, timestamp);
