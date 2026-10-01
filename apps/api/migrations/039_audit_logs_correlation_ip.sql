-- Migration 039: Audit logs correlation ID and IP hash
-- Adds nullable correlation_id (for request tracing) and ip_hash (SHA-256 of client IP)

ALTER TABLE "audit_logs"
    ADD COLUMN "correlation_id" UUID,
    ADD COLUMN "ip_hash" VARCHAR(64);

CREATE INDEX "idx_audit_logs_correlation_id" ON "audit_logs" ("correlation_id");