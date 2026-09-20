-- Migration 019: Phase 11 Step 2 Proposal Engine
-- Implements persistence for Proposals and Proposal Versions.

CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commercial_package_id UUID NOT NULL REFERENCES commercial_packages(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'GENERATED', etc.
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS proposal_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    commercial_package_id UUID NOT NULL REFERENCES commercial_packages(id),
    pricing_recommendation_id UUID NOT NULL REFERENCES pricing_recommendations(id),
    offer_option_id UUID NOT NULL REFERENCES offer_options(id),
    solution_version_id UUID NOT NULL,
    requirements_version_id UUID NOT NULL,
    pain_analysis_version_id UUID NOT NULL,
    qualification_version_id UUID NOT NULL,
    intent_version_id UUID,
    demo_id UUID,
    content JSONB NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS proposal_generation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_version_id UUID REFERENCES proposal_versions(id),
    provider_type VARCHAR(50) NOT NULL,
    rules_version VARCHAR(50) NOT NULL,
    input_source_versions JSONB NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    error TEXT
);

-- Indexes
CREATE INDEX idx_prop_package ON proposals(commercial_package_id);
CREATE INDEX idx_prop_ver_proposal ON proposal_versions(proposal_id);
CREATE INDEX idx_prop_ver_package ON proposal_versions(commercial_package_id);
CREATE INDEX idx_prop_run_ver ON proposal_generation_runs(proposal_version_id);
