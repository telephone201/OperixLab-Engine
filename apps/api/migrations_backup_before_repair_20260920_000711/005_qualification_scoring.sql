-- Domain: Qualification & Commercial Intent

CREATE TABLE qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    total_score INT NOT NULL,
    max_score INT DEFAULT 100,
    threshold INT DEFAULT 50,
    qualified BOOLEAN DEFAULT false,
    label VARCHAR(20), -- 'PRIORITY_A', 'PRIORITY_B', 'NURTURE', 'REJECT'
    version INT DEFAULT 1,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE score_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID REFERENCES qualifications(id) ON DELETE CASCADE,
    component_name VARCHAR(100) NOT NULL, -- 'ICP Fit', 'Automation Opportunity', etc.
    raw_value TEXT,
    score INT NOT NULL,
    max_score INT NOT NULL,
    confidence FLOAT,
    reasoning TEXT,
    source_evidence_ids UUID[], -- Array of research_evidence IDs
    is_overridden BOOLEAN DEFAULT false,
    override_score INT,
    override_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE intent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- e.g., 'PRICING_REQUESTED', 'READY_TO_BUY'
    source VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    evidence TEXT,
    confidence FLOAT,
    previous_intent VARCHAR(50),
    new_intent VARCHAR(50),
    event_strength INT,
    actor VARCHAR(100),
    notes TEXT,
    metadata JSONB
);

CREATE TABLE intent_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL, -- 'NO_SIGNAL', 'LOW_INTENT', 'WARM', 'HOT', 'READY_TO_BUY'
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(100),
    reason TEXT
);

CREATE TABLE commercial_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    signal_type VARCHAR(100) NOT NULL, -- 'PRICING_REQUESTED', 'MEETING_REQUESTED'
    evidence TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'ACTIVE'
);

CREATE TABLE human_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'SCORE_COMPONENT', 'QUALIFICATION', 'INTENT'
    entity_id UUID NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    reason TEXT,
    actor VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_qual_lead ON qualifications(lead_id);
CREATE INDEX idx_qual_label ON qualifications(label);
CREATE INDEX idx_score_qual ON score_components(qualification_id);
CREATE INDEX idx_intent_lead ON intent_events(lead_id);
CREATE INDEX idx_intent_state_lead ON intent_state_history(lead_id);
CREATE INDEX idx_sig_lead ON commercial_signals(lead_id);
CREATE INDEX idx_override_entity ON human_overrides(entity_id);
