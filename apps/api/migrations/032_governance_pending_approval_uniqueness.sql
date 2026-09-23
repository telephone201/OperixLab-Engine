-- Migration 032: Prevent multiple pending governance approvals
-- for the same entity and approval type while preserving approval history.

CREATE UNIQUE INDEX IF NOT EXISTS ux_governance_approvals_pending_entity_type
    ON governance_approvals(entity_id, approval_type)
    WHERE status = 'PENDING';