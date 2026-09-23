-- Payment readiness is agreement-scoped.
-- A proposal may have multiple agreements, so proposal_id
-- cannot uniquely identify the current readiness state.

ALTER TABLE payment_readiness
    DROP CONSTRAINT IF EXISTS payment_readiness_pkey;

ALTER TABLE payment_readiness
    ADD CONSTRAINT payment_readiness_pkey
    PRIMARY KEY (agreement_id);

ALTER TABLE payment_readiness
    ADD CONSTRAINT fk_payment_readiness_agreement
    FOREIGN KEY (agreement_id)
    REFERENCES commercial_agreements(id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pr_proposal
    ON payment_readiness(proposal_id);
