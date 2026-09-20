-- Migration 002: Hardening and Missing Entities
-- This migration addresses gaps found during the Phase 1 Verification Pass.

-- 1. Missing Research Evidence table
CREATE TABLE research_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    evidence_text TEXT NOT NULL,
    source_url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Missing Score Components table (for detailed qualification breakdown)
CREATE TABLE score_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID REFERENCES qualification(id) ON DELETE CASCADE,
    component_name VARCHAR(100), -- e.g., 'ICP Fit', 'Decision Maker'
    score INT,
    weight FLOAT,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Pricing Versioning
CREATE TABLE pricing_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_research_id UUID REFERENCES pricing_research(id) ON DELETE CASCADE,
    version_number INT,
    recommended_price FLOAT,
    target_price FLOAT,
    cost_floor FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Solution-to-Requirements Link (Structural Enforcement)
-- Ensures a solution is actually mapped to the requirements it satisfies.
CREATE TABLE solution_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    coverage_level VARCHAR(50) DEFAULT 'FULL', -- 'FULL', 'PARTIAL', 'NOT_COVERED'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Hardening: Payment Verification Detail
ALTER TABLE payments ADD COLUMN verification_notes TEXT;

-- 6. Hardening: Pricing Approval status
ALTER TABLE pricing_research ADD COLUMN approved_price FLOAT;
ALTER TABLE pricing_research ADD COLUMN approval_status VARCHAR(50) DEFAULT 'PENDING'; -- 'PENDING', 'APPROVED', 'REJECTED'

-- 7. Hardening: Project Payment Gate
-- Adds explicit tracking for whether the 'Project Start' payment has been verified.
ALTER TABLE projects ADD COLUMN payment_status VARCHAR(50) DEFAULT 'REQUIRED'; -- 'REQUIRED', 'VERIFIED', 'PARTIAL'
ALTER TABLE projects ADD COLUMN payment_verified_at TIMESTAMP WITH TIME ZONE;

-- Indexes for new tables
CREATE INDEX idx_research_evidence_id ON research_evidence(research_id);
CREATE INDEX idx_score_components_id ON score_components(qualification_id);
CREATE INDEX idx_pricing_versions_id ON pricing_versions(pricing_research_id);
CREATE INDEX idx_sol_req_sol ON solution_requirements(solution_id);
CREATE INDEX idx_sol_req_req ON solution_requirements(requirement_id);
