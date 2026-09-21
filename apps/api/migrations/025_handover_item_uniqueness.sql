-- Migration 025: Handover Item Uniqueness
-- Prevents duplicate checklist items for the same handover.

CREATE UNIQUE INDEX IF NOT EXISTS ux_handover_items_identity
    ON handover_items(handover_id, category, title);