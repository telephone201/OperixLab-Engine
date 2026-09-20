-- Migration 011: Deployment Safety Pipeline Persistence
-- Implements tracking for workflow deployments, manifests, snapshots, and environment bindings.

CREATE TABLE IF NOT EXISTS workflow_environment_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID NOT NULL,
    environment VARCHAR(50) NOT NULL,
    n8n_workflow_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_version_id, environment)
);

CREATE TABLE IF NOT EXISTS workflow_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID NOT NULL,
    artifact_id UUID NOT NULL,
    artifact_hash VARCHAR(64) NOT NULL,
    solution_id UUID NOT NULL,
    environment VARCHAR(50) NOT NULL,
    deployment_mode VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE'
    n8n_workflow_id VARCHAR(255),
    status VARCHAR(50) NOT NULL, -- See DeploymentStatus enum
    requested_by UUID,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(100),
    error_message_safe TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES workflow_deployments(id),
    workflow_version_id UUID NOT NULL,
    artifact_id UUID NOT NULL,
    artifact_hash VARCHAR(64) NOT NULL,
    solution_id UUID NOT NULL,
    solution_version_id VARCHAR(50),
    origin_type VARCHAR(50),
    environment VARCHAR(50) NOT NULL,
    requested_by UUID,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    validation_id UUID NOT NULL,
    validation_ruleset_version VARCHAR(50),
    n8n_target VARCHAR(255),
    existing_n8n_workflow_id VARCHAR(255),
    deployment_mode VARCHAR(20) NOT NULL,
    activation_requested BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES workflow_deployments(id),
    n8n_workflow_id VARCHAR(255) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    workflow_content_hash VARCHAR(64) NOT NULL,
    workflow_content JSONB NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES workflow_deployments(id),
    status VARCHAR(50) NOT NULL, -- 'NOT_VERIFIED', 'VERIFIED', etc.
    deployed_hash VARCHAR(64),
    expected_hash VARCHAR(64),
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES workflow_deployments(id),
    n8n_workflow_id VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'ACTIVATE', 'DEACTIVATE'
    status VARCHAR(50) NOT NULL,
    requested_by UUID,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_message_safe TEXT
);

-- Indexes for performance and identity mapping
CREATE INDEX idx_deployment_version_env ON workflow_deployments(workflow_version_id, environment);
CREATE INDEX idx_binding_version_env ON workflow_environment_bindings(workflow_version_id, environment);
CREATE INDEX idx_manifest_deployment ON deployment_manifests(deployment_id);
CREATE INDEX idx_snapshot_deployment ON deployment_snapshots(deployment_id);
