-- Migration 006: Pain Analysis & Problem Intelligence
-- Transforms research evidence into structured business problem intelligence.

CREATE TABLE pain_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    research_version_id UUID REFERENCES research_versions(id),
    qualification_version_id UUID REFERENCES qualifications(id), -- Assuming qualification versioning in table
    analysis_version INT NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT', -- 'DRAFT', 'EVIDENCE_REQUIRED', 'SUPPORTED', 'NEEDS_RESEARCH', 'CONTRADICTED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED'
    overall_confidence FLOAT,
    primary_pain_id UUID, -- Circular reference handled by separate updates or nullable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES pain_analyses(id) ON DELETE CASCADE,
    pain_type VARCHAR(100) NOT NULL, -- e.g., 'LEAD_MANAGEMENT', 'DATA_ENTRY'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    evidence_type VARCHAR(50) NOT NULL, -- 'OBSERVED', 'INFERRED', 'UNKNOWN'
    severity VARCHAR(50) DEFAULT 'UNKNOWN', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'
    frequency VARCHAR(50) DEFAULT 'UNKNOWN', -- 'RARE', 'OCCASIONAL', 'REGULAR', 'FREQUENT', 'CONTINUOUS', 'UNKNOWN'
    automation_relevance VARCHAR(50) DEFAULT 'UNKNOWN', -- 'LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'
    confidence FLOAT DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'DRAFT',
    priority VARCHAR(50) DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    reasoning TEXT,
    source VARCHAR(255),
    version INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Link pains back to specific research evidence IDs for traceability
CREATE TABLE pain_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pain_id UUID REFERENCES pains(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES research_evidence(id) ON DELETE CASCADE,
    contribution_type VARCHAR(50), -- 'SUPPORTING', 'CONTRADICTORY'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pain_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pain_id UUID REFERENCES pains(id) ON DELETE CASCADE,
    impact_type VARCHAR(100) NOT NULL, -- e.g., 'TIME', 'ERROR_RISK', 'SALES_DELAY'
    impact_category VARCHAR(100), -- 'OPERATIONAL', 'COMMERCIAL', 'CUSTOMER'
    level VARCHAR(50), -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    evidence TEXT,
    confidence FLOAT,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pain_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_pain_id UUID REFERENCES pains(id) ON DELETE CASCADE,
    child_pain_id UUID REFERENCES pains(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'ROOT_CAUSE', 'SYMPTOM', 'CONSEQUENCE', 'RELATED'
    confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pain_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pain_cluster_members (
    cluster_id UUID REFERENCES pain_clusters(id) ON DELETE CASCADE,
    pain_id UUID REFERENCES pains(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_id, pain_id)
);

CREATE TABLE pain_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES pain_analyses(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    target_pain_id UUID REFERENCES pains(id) ON DELETE SET NULL,
    category VARCHAR(50), -- 'INTERNAL_DISCOVERY', 'CLIENT_FACING'
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'ANSWERED', 'DISCARDED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Circular reference for primary pain in pain_analyses
ALTER TABLE pain_analyses
ADD CONSTRAINT fk_primary_pain
FOREIGN KEY (primary_pain_id) REFERENCES pains(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_pain_analysis_lead ON pain_analyses(lead_id);
CREATE INDEX idx_pains_analysis ON pains(analysis_id);
CREATE INDEX idx_pains_type ON pains(pain_type);
CREATE INDEX idx_pains_status ON pains(status);
CREATE INDEX idx_pain_evidence_pain ON pain_evidence(pain_id);
CREATE INDEX idx_pain_impacts_pain ON pain_impacts(pain_id);
CREATE INDEX idx_pain_rels_parent ON pain_relationships(parent_pain_id);
CREATE INDEX idx_pain_rels_child ON pain_relationships(child_pain_id);
CREATE INDEX idx_pain_questions_analysis ON pain_questions(analysis_id);
