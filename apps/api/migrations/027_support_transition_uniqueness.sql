-- Migration 027: Support Transition Uniqueness
-- Prevents duplicate support activation for the same handover/readiness.

CREATE UNIQUE INDEX IF NOT EXISTS ux_support_transitions_handover_readiness
    ON support_transitions(handover_id, support_readiness_id);
