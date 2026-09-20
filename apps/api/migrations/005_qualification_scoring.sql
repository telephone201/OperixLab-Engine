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

CREATE TABLE IF NOT EXISTS score_components (
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

CREATE TABLE IF NOT EXISTS intent_events (
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

-- ============================================================
-- Reconciliation: legacy qualification / score_components
-- ============================================================

-- Preserve the legacy qualification records in the new
-- versioned qualification table using the same UUIDs.
INSERT INTO qualifications (
    id,
    lead_id,
    total_score,
    max_score,
    threshold,
    qualified,
    label,
    version,
    calculated_at,
    updated_at
)
SELECT
    q.id,
    q.lead_id,
    COALESCE(q.total_score, 0),
    100,
    50,
    COALESCE(q.total_score, 0) >= 50,
    q.label,
    1,
    COALESCE(q.created_at, CURRENT_TIMESTAMP),
    COALESCE(q.created_at, CURRENT_TIMESTAMP)
FROM qualification q
WHERE NOT EXISTS (
    SELECT 1
    FROM qualifications nq
    WHERE nq.id = q.id
);

-- The legacy score_components table originally pointed at
-- qualification(id). The new contract points at qualifications(id).
-- Because the UUIDs above are preserved, existing component rows
-- remain valid after switching the FK.
ALTER TABLE score_components
    DROP CONSTRAINT IF EXISTS score_components_qualification_id_fkey;

ALTER TABLE score_components
    ADD CONSTRAINT score_components_qualification_id_fkey_v2
    FOREIGN KEY (qualification_id)
    REFERENCES qualifications(id)
    ON DELETE CASCADE;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS raw_value TEXT;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS max_score INTEGER;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS source_evidence_ids UUID[];

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS is_overridden BOOLEAN DEFAULT FALSE;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS override_score INTEGER;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS override_reason TEXT;

ALTER TABLE score_components
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

UPDATE score_components
SET max_score = COALESCE(max_score, score)
WHERE max_score IS NULL;

-- Reconcile legacy intent_events with the newer contract.
ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(100);

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS source VARCHAR(100);

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS evidence TEXT;

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS previous_intent VARCHAR(50);

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS new_intent VARCHAR(50);

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS event_strength INTEGER;

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS actor VARCHAR(100);

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE intent_events
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_qual_lead ON qualifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_qual_label ON qualifications(label);
CREATE INDEX IF NOT EXISTS idx_score_qual ON score_components(qualification_id);
CREATE INDEX IF NOT EXISTS idx_intent_lead ON intent_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_intent_state_lead ON intent_state_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_sig_lead ON commercial_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_override_entity ON human_overrides(entity_id);
