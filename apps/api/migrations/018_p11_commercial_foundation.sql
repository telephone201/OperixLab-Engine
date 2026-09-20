-- Migration 018: Phase 11 Step 1 Commercial Foundation
-- Establishes core entities for Commercial Packages, Pricing, and Offers.

CREATE TABLE IF NOT EXISTS commercial_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    company_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    solution_architecture_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    requirements_version_id UUID,
    pain_analysis_version_id UUID,
    qualification_version_id UUID,
    intent_version_id UUID,
    demo_id UUID,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'READY_FOR_PRICING', etc.
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    valid_until TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    updated_by UUID,
    CONSTRAINT fk_cp_solution_arch FOREIGN KEY (solution_architecture_id) REFERENCES solution_architectures(id),
    CONSTRAINT fk_cp_solution_ver FOREIGN KEY (solution_version_id) REFERENCES workflow_versions(id)
);

CREATE TABLE IF NOT EXISTS pricing_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commercial_package_id UUID NOT NULL REFERENCES commercial_packages(id) ON DELETE CASCADE,
    solution_architecture_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    pricing_version INTEGER NOT NULL DEFAULT 1,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    market_range_min NUMERIC(15, 2),
    market_range_max NUMERIC(15, 2),
    cost_floor NUMERIC(15, 2) NOT NULL,
    target_price NUMERIC(15, 2) NOT NULL,
    recommended_price NUMERIC(15, 2) NOT NULL,
    pricing_confidence NUMERIC(3, 2),
    market_data_confidence NUMERIC(3, 2),
    reasoning TEXT,
    assumptions TEXT,
    risk_factors TEXT,
    pricing_evidence_reference TEXT,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'GENERATED', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS offer_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commercial_package_id UUID NOT NULL REFERENCES commercial_packages(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    included_scope TEXT[],
    optional_scope TEXT[],
    out_of_scope TEXT[],
    setup_fee NUMERIC(15, 2) NOT NULL,
    recurring_fee NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    billing_cycle VARCHAR(50) NOT NULL,
    minimum_commitment_months INTEGER NOT NULL DEFAULT 0,
    payment_terms TEXT,
    setup_payment_percentage NUMERIC(5, 2),
    setup_balance_terms TEXT,
    implementation_start_condition TEXT,
    cancellation_terms TEXT,
    scope_change_terms TEXT,
    support_terms TEXT,
    valid_until TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL
);


-- ============================================================
-- Reconciliation: legacy pricing / offer tables
-- ============================================================

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS commercial_package_id UUID;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS solution_architecture_id UUID;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS solution_version_id UUID;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS pricing_version INTEGER DEFAULT 1;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS market_range_min NUMERIC(15,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS market_range_max NUMERIC(15,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS cost_floor NUMERIC(15,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS target_price NUMERIC(15,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS pricing_confidence NUMERIC(3,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS market_data_confidence NUMERIC(3,2);

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS reasoning TEXT;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS assumptions TEXT;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS risk_factors TEXT;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS pricing_evidence_reference TEXT;

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';

ALTER TABLE pricing_recommendations
    ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS commercial_package_id UUID;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS name VARCHAR(255);

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS included_scope TEXT[];

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS optional_scope TEXT[];

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS out_of_scope TEXT[];

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS setup_fee NUMERIC(15,2);

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS recurring_fee NUMERIC(15,2);

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50);

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS minimum_commitment_months INTEGER DEFAULT 0;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS payment_terms TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS setup_payment_percentage NUMERIC(5,2);

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS setup_balance_terms TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS implementation_start_condition TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS cancellation_terms TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS scope_change_terms TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS support_terms TEXT;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE offer_options
    ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_cp_lead ON commercial_packages(lead_id);
CREATE INDEX IF NOT EXISTS idx_cp_solution ON commercial_packages(solution_version_id);
CREATE INDEX IF NOT EXISTS idx_pr_package ON pricing_recommendations(commercial_package_id);
CREATE INDEX IF NOT EXISTS idx_oo_package ON offer_options(commercial_package_id);
-- ============================================================
-- Final indexes (after legacy-schema reconciliation)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cp_lead ON commercial_packages(lead_id);
CREATE INDEX IF NOT EXISTS idx_cp_solution ON commercial_packages(solution_version_id);
CREATE INDEX IF NOT EXISTS idx_pr_package ON pricing_recommendations(commercial_package_id);
CREATE INDEX IF NOT EXISTS idx_oo_package ON offer_options(commercial_package_id);