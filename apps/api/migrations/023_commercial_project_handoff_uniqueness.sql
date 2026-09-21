-- Migration 023: Commercial Project Handoff Uniqueness
-- Enforces one execution contract per proposal and one project per contract.

CREATE UNIQUE INDEX IF NOT EXISTS ux_contracts_proposal_id
    ON contracts(proposal_id)
    WHERE proposal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_contract_id
    ON projects(contract_id)
    WHERE contract_id IS NOT NULL;
