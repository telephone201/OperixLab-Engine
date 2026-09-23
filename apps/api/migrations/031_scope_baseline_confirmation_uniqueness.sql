-- Migration 031: Prevent duplicate scope baselines for one requirements confirmation.

CREATE UNIQUE INDEX IF NOT EXISTS ux_scope_baselines_confirmation
    ON scope_baselines(confirmation_id);