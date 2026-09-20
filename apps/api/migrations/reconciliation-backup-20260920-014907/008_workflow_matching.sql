-- Phase 8: Workflow Matching & Solution Architecture
-- This migration implements the data structures required to match requirements to
-- the existing workflow library and track the solution lifecycle.

-- 1. Workflow Library (Mirrors index.json for SQL efficiency)
CREATE TABLE IF NOT EXISTS workflow_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    integrations JSONB, -- Store as array: ["CRM", "Email"]
    triggers JSONB,     -- Store as array: ["Webhook", "Schedule"]
    complexity INT,
    quality_score INT,
    source_hash VARCHAR(64),
    source_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Matching Sessions (The root of a matching attempt)
CREATE TABLE IF NOT EXISTS workflow_match_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    requirements_version_id UUID NOT NULL,
    status VARCHAR(50) DEFAULT 'ANALYZING', -- ANALYZING, MATCHED, REVIEW_REQUIRED, APPROVED, REJECTED
    strategy VARCHAR(50), -- REUSE, CUSTOMIZE, COMPOSE, BUILD, NO_MATCH
    overall_confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Workflow Candidates (Candidates identified for a session)
CREATE TABLE IF NOT EXISTS workflow_match_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workflow_match_sessions(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflow_library(id) ON DELETE CASCADE,
    match_score FLOAT,
    rank INT,
    status VARCHAR(50) DEFAULT 'CANDIDATE', -- CANDIDATE, DISQUALIFIED, SELECTED
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Requirement Coverage Matrix (The evidence for the match)
CREATE TABLE IF NOT EXISTS workflow_requirement_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES workflow_match_candidates(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL, -- FK to requirements table
    coverage_level VARCHAR(50), -- FULL, PARTIAL, NONE, UNKNOWN
    evidence TEXT,
    confidence FLOAT,
    is_must_requirement BOOLEAN DEFAULT FALSE
);

-- 5. Hard Gate Results (Audit of binary checks)
CREATE TABLE IF NOT EXISTS workflow_compatibility_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES workflow_match_candidates(id) ON DELETE CASCADE,
    gate_type VARCHAR(50), -- TRIGGER, INPUT, OUTPUT, INTEGRATION, SECURITY, LICENSE
    result VARCHAR(50), -- PASS, FAIL, UNKNOWN
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Solution Architectures (The final approved blueprint)
CREATE TABLE IF NOT EXISTS solution_architectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workflow_match_sessions(id),
    lead_id UUID NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    blueprint JSONB, -- JSON definition of the solution (Composite map, etc.)
    version INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'DRAFT',
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Solution Versioning (Audit trail for modifications)
CREATE TABLE IF NOT EXISTS solution_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solution_architectures(id) ON DELETE CASCADE,
    version INT NOT NULL,
    config_snapshot JSONB,
    changelog TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_wf_lib_category ON workflow_library(category);
CREATE INDEX idx_wf_matches_session ON workflow_match_candidates(session_id);
CREATE INDEX idx_wf_coverage_candidate ON workflow_requirement_matches(candidate_id);
CREATE INDEX idx_sol_lead ON solution_architectures(lead_id);
