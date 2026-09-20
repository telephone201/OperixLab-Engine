-- Migration 007: Requirements Extraction & Solution Specification
-- Transforms business pains into structured, evidence-backed requirements.

CREATE TABLE requirements_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    research_version_id UUID REFERENCES research_versions(id),
    qualification_version_id UUID REFERENCES qualifications(id),
    pain_analysis_version_id UUID REFERENCES pain_analyses(id),
    analysis_version INT NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED'
    overall_completeness FLOAT, -- 0.0 to 1.0
    overall_confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES requirements_analyses(id) ON DELETE CASCADE,
    source_pain_id UUID REFERENCES pains(id),
    type VARCHAR(50) NOT NULL, -- 'FUNCTIONAL', 'NON_FUNCTIONAL', 'BUSINESS_RULE', 'DATA', 'INTEGRATION', 'SECURITY', 'HUMAN_IN_THE_LOOP', 'OPERATIONAL', 'REPORTING', 'NOTIFICATION', 'USER_EXPERIENCE', 'COMPLIANCE', 'CONSTRAINT'
    category VARCHAR(100), -- e.g., 'LEAD_ACQUISITION', 'CRM', 'NOTIFICATIONS'
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'UNKNOWN', -- 'MUST', 'SHOULD', 'COULD', 'UNKNOWN'
    certainty VARCHAR(50) DEFAULT 'UNKNOWN', -- 'CONFIRMED', 'INFERRED', 'UNKNOWN'
    confidence FLOAT DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'CANDIDATE', -- 'CANDIDATE', 'VALIDATED', 'APPROVED', 'SUPERSEDED'

    -- Specifications
    trigger_definition TEXT,
    input_definition JSONB,
    output_definition JSONB,
    acceptance_criteria JSONB,
    business_rule TEXT,
    data_requirements JSONB,
    integration_requirements JSONB,
    human_action_required BOOLEAN DEFAULT false,
    constraints TEXT,
    security_requirements TEXT,

    automation_boundary VARCHAR(50) DEFAULT 'UNKNOWN', -- 'AUTOMATABLE', 'PARTIALLY_AUTOMATABLE', 'HUMAN_REQUIRED', 'UNKNOWN'

    reasoning TEXT,
    version INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirement_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES research_evidence(id) ON DELETE CASCADE,
    contribution_type VARCHAR(50), -- 'SUPPORTING', 'CONTRADICTORY'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirement_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_req_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    target_req_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL, -- 'REQUIRES', 'BLOCKS', 'ENHANCES', 'RELATED'
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirement_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    req_a_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    req_b_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    conflict_type VARCHAR(100),
    description TEXT,
    status VARCHAR(50) DEFAULT 'UNRESOLVED', -- 'UNRESOLVED', 'RESOLVED', 'NEEDS_CLIENT_CLARIFICATION'
    resolution TEXT,
    confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requirement_assumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    req_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    assumption_text TEXT NOT NULL,
    risk_level VARCHAR(50) DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
    validation_method TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'VALIDATED', 'REJECTED', 'NEEDS_CONFIRMATION'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_req_analysis_lead ON requirements_analyses(lead_id);
CREATE INDEX idx_reqs_analysis ON requirements(analysis_id);
CREATE INDEX idx_reqs_type ON requirements(type);
CREATE INDEX idx_reqs_priority ON requirements(priority);
CREATE INDEX idx_reqs_status ON requirements(status);
CREATE INDEX idx_req_evidence_req ON requirement_evidence(requirement_id);
CREATE INDEX idx_req_deps_source ON requirement_dependencies(source_req_id);
CREATE INDEX idx_req_deps_target ON requirement_dependencies(target_req_id);
CREATE INDEX idx_req_conflicts_a ON requirement_conflicts(req_a_id);
CREATE INDEX idx_req_conflicts_b ON requirement_conflicts(req_b_id);
CREATE INDEX idx_req_assumptions_req ON requirement_assumptions(req_id);
