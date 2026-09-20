-- Phase 9 Step 3: Six-Layer Validation Engine
-- This migration implements the data structures for tracking the validation of
-- derived workflow artifacts before deployment.

-- 1. Validation Runs
-- Root record for a single validation attempt of a specific workflow version.
CREATE TABLE IF NOT EXISTS workflow_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
    artifact_hash VARCHAR(64) NOT NULL, -- The exact hash of the artifact validated
    ruleset_version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, PASSED, FAILED, REQUIRES_REVIEW, BLOCKED
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    overall_result TEXT,
    created_by UUID
);

CREATE INDEX idx_wf_val_version ON workflow_validations(workflow_version_id);
CREATE INDEX idx_wf_val_status ON workflow_validations(status);

-- 2. Validation Findings
-- Detailed issues discovered during the validation process.
CREATE TABLE IF NOT EXISTS validation_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES workflow_validations(id) ON DELETE CASCADE,
    layer VARCHAR(50) NOT NULL, -- STRUCTURAL, DEPENDENCY, DATA, SECURITY, BUSINESS, OPERATIONAL
    rule_id VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL, -- INFO, LOW, MEDIUM, HIGH, CRITICAL
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, RESOLVED, ACCEPTED_RISK, WAIVED
    title VARCHAR(255) NOT NULL,
    description TEXT,
    evidence TEXT,
    workflow_node_id VARCHAR(255),
    workflow_path TEXT,
    expected TEXT,
    actual TEXT,
    reasoning TEXT,
    blocking BOOLEAN DEFAULT FALSE,
    requires_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_val_findings_val_id ON validation_findings(validation_id);
CREATE INDEX idx_val_findings_severity ON validation_findings(severity);

-- 3. Validation Layer Results
-- Summary results for each of the six layers.
CREATE TABLE IF NOT EXISTS validation_layer_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES workflow_validations(id) ON DELETE CASCADE,
    layer VARCHAR(50) NOT NULL,
    result VARCHAR(50) NOT NULL, -- PASS, FAIL, WARN, UNKNOWN
    findings_count INT DEFAULT 0,
    logs TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_val_layer_val_id ON validation_layer_results(validation_id);

-- 4. Validation Requirement Results
-- Traceability from business requirements to implementation evidence.
CREATE TABLE IF NOT EXISTS validation_requirement_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES workflow_validations(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL, -- SATISFIED, PARTIALLY_SATISFIED, UNSATISFIED, UNKNOWN
    evidence TEXT,
    workflow_node_ids JSONB, -- Array of nodes implementing this requirement
    mapping_ids JSONB,
    transformation_ids JSONB,
    finding_ids JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_val_req_val_id ON validation_requirement_results(validation_id);
