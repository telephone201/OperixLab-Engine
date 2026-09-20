-- Migration 022: Code Contract Completion
-- Adds database tables referenced by the current API code
-- but not covered by the previous migration set.

-- ============================================================
-- 1. Research Requests
-- ============================================================

CREATE TABLE IF NOT EXISTS research_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_requests_lead
    ON research_requests(lead_id);

-- ============================================================
-- 2. Research Data
-- ============================================================

CREATE TABLE IF NOT EXISTS research_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES research_requests(id) ON DELETE CASCADE,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_data_request
    ON research_data(request_id);

-- ============================================================
-- 3. Intent States
-- ============================================================

CREATE TABLE IF NOT EXISTS intent_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL DEFAULT 'NO_SIGNAL',
    commercial_signal VARCHAR(100),
    intent_score INTEGER DEFAULT 0,
    response_summary TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intent_states_lead_updated
    ON intent_states(lead_id, updated_at DESC);

-- ============================================================
-- 4. Qualification Results
-- Compatibility/read-model table used by the API.
-- ============================================================

CREATE TABLE IF NOT EXISTS qualification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    qualification_id UUID REFERENCES qualifications(id),
    total_score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 100,
    label VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qualification_results_lead
    ON qualification_results(lead_id, created_at DESC);

-- ============================================================
-- 5. Commercial Agreement Acceptances
-- ============================================================

CREATE TABLE IF NOT EXISTS commercial_agreement_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_type VARCHAR(50),
    evidence_ref TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agreement_acceptances_agreement
    ON commercial_agreement_acceptances(agreement_id);
