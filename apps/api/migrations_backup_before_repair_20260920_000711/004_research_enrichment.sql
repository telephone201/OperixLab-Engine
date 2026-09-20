-- Domain: Research Enrichment
CREATE TABLE research_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE research_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL, -- e.g., 'decision_maker', 'crm_system'
    status VARCHAR(50) DEFAULT 'UNKNOWN', -- 'UNKNOWN', 'NEEDS_RESEARCH', 'RESEARCHED', 'VERIFIED'
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE automation_readiness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    signal_name VARCHAR(100) NOT NULL, -- e.g., 'online_booking', 'chat_widget'
    value BOOLEAN DEFAULT false,
    evidence TEXT,
    confidence FLOAT,
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE technology_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    tech_name VARCHAR(100) NOT NULL, -- e.g., 'HubSpot', 'Shopify'
    evidence TEXT,
    source_url TEXT,
    confidence FLOAT,
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE decision_maker_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    person_name VARCHAR(255),
    role VARCHAR(100),
    source_url TEXT,
    evidence_text TEXT,
    confidence FLOAT,
    verified_status VARCHAR(50) DEFAULT 'UNVERIFIED',
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_res_versions_id ON research_versions(research_id);
CREATE INDEX idx_res_gaps_id ON research_gaps(research_id);
CREATE INDEX idx_auto_ready_comp ON automation_readiness(company_id);
CREATE INDEX idx_tech_signals_comp ON technology_signals(company_id);
CREATE INDEX idx_dm_evidence_comp ON decision_maker_evidence(company_id);
