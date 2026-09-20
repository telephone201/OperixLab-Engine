-- Migration 020: Phase 11 Step 4 Engagement & Intent Integration
-- Implements persistence for tracking proposal engagement events and metrics.

CREATE TABLE IF NOT EXISTS engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    company_id UUID,
    contact_id UUID,
    proposal_id UUID NOT NULL,
    proposal_version_id UUID,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    correlation_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposal_engagement_state (
    proposal_id UUID PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'NOT_SENT', 'SENT', 'OPENED', 'ENGAGED', etc.
    first_open_at TIMESTAMP WITH TIME ZONE,
    last_open_at TIMESTAMP WITH TIME ZONE,
    open_count INTEGER DEFAULT 0,
    section_view_count INTEGER DEFAULT 0,
    demo_click_count INTEGER DEFAULT 0,
    pricing_view_count INTEGER DEFAULT 0,
    cta_click_count INTEGER DEFAULT 0,
    meeting_click_count INTEGER DEFAULT 0,
    meeting_booked BOOLEAN DEFAULT FALSE,
    last_engagement_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_ee_lead ON engagement_events(lead_id);
CREATE INDEX idx_ee_proposal ON engagement_events(proposal_id);
CREATE INDEX idx_ee_type ON engagement_events(event_type);
CREATE INDEX idx_ee_timestamp ON engagement_events(timestamp);
