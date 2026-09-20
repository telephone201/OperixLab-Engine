/**
 * @file 021_p11_agreement_payment_readiness.sql
 * @description Migration for Commercial Agreement and Payment Readiness.
 */

-- 1. Commercial Agreements
CREATE TABLE IF NOT EXISTS commercial_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commercial_package_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    proposal_version_id UUID NOT NULL,
    solution_version_id UUID NOT NULL,
    requirements_version_id UUID,
    company_id UUID NOT NULL,
    contact_id UUID,
    status VARCHAR(50) NOT NULL, -- 'DRAFT', 'SENT', 'ACCEPTED', etc.
    fingerprint TEXT NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    accepted_by UUID,
    accepted_via VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Agreement Versions (Immutable history)
CREATE TABLE IF NOT EXISTS commercial_agreement_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content JSONB NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    expected_amount NUMERIC(15, 2) NOT NULL,
    verified_amount NUMERIC(15, 2) DEFAULT 0,
    currency VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'VERIFIED', 'REJECTED'
    submitted_amount NUMERIC(15, 2),
    client_reference VARCHAR(255),
    evidence_ref TEXT,
    verified_by UUID,
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Payment Readiness
CREATE TABLE IF NOT EXISTS payment_readiness (
    proposal_id UUID PRIMARY KEY,
    agreement_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'READY', 'NOT_READY'
    last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_amount_total NUMERIC(15, 2) DEFAULT 0,
    required_amount_total NUMERIC(15, 2) DEFAULT 0,
    details JSONB
);

-- Indexes
CREATE INDEX idx_ca_package ON commercial_agreements(commercial_package_id);
CREATE INDEX idx_ca_status ON commercial_agreements(status);
CREATE INDEX idx_pay_agreement ON payments(agreement_id);
CREATE INDEX idx_pay_status ON payments(status);
CREATE INDEX idx_pr_proposal ON payment_readiness(proposal_id);
