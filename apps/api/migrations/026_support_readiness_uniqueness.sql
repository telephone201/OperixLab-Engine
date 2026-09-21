-- Migration 026: Support Readiness Uniqueness
-- Prevents duplicate support readiness records for the same handover.

CREATE UNIQUE INDEX IF NOT EXISTS ux_support_readiness_handover_id
    ON support_readiness(handover_id);
