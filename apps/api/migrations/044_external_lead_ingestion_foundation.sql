-- Migration 044: External lead ingestion foundation
-- New migration only. Do not modify historical migrations.
-- Non-destructive, backward-compatible foundation for ingesting external leads.

-- ============================================================
-- 1. Ingestion Batches Table
-- Tracks import runs from external providers/files (e.g. CSV, Apify, Scraper)
-- ============================================================

CREATE TABLE IF NOT EXISTS ingestion_batches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name        VARCHAR(255),
    source            VARCHAR(100) NOT NULL,
    provider          VARCHAR(100),
    status            VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    total_records     INT NOT NULL DEFAULT 0,
    processed_records INT NOT NULL DEFAULT 0,
    imported_records  INT NOT NULL DEFAULT 0,
    duplicate_records INT NOT NULL DEFAULT 0,
    failed_records    INT NOT NULL DEFAULT 0,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message     TEXT,
    created_by        UUID,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ingestion_batches_status_check
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'FAILED',
                'PARTIAL'
            )
        ),

    CONSTRAINT ingestion_batches_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES app_users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ingestion_batches_status
    ON ingestion_batches (status);

CREATE INDEX IF NOT EXISTS idx_ingestion_batches_source
    ON ingestion_batches (source);

CREATE INDEX IF NOT EXISTS idx_ingestion_batches_created_at
    ON ingestion_batches (created_at DESC);


-- ============================================================
-- 2. Raw Lead Staging Table
-- Stores raw payload and extracted normalized fields prior to promotion
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_lead_staging (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                UUID NOT NULL,
    row_index               INT,
    raw_payload             JSONB NOT NULL,
    company_name            VARCHAR(255),
    normalized_company_name VARCHAR(255),
    website                 TEXT,
    domain                  VARCHAR(255),
    contact_name            VARCHAR(255),
    contact_email           VARCHAR(255),
    contact_title           VARCHAR(100),
    phone                   VARCHAR(50),
    address                 TEXT,
    city                    VARCHAR(100),
    country                 VARCHAR(100),
    industry                VARCHAR(100),
    source                  VARCHAR(100),
    provider                VARCHAR(100),
    source_url              TEXT,
    source_external_id      VARCHAR(255),
    dedup_key               VARCHAR(255),
    status                  VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    duplicate_of_lead_id    UUID,
    lead_id                 UUID,
    company_id              UUID,
    error_message           TEXT,
    processed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT raw_lead_staging_status_check
        CHECK (
            status IN (
                'PENDING',
                'NORMALIZED',
                'PROCESSED',
                'DUPLICATE',
                'FAILED',
                'REJECTED'
            )
        ),

    CONSTRAINT raw_lead_staging_batch_id_fkey
        FOREIGN KEY (batch_id)
        REFERENCES ingestion_batches(id)
        ON DELETE CASCADE,

    CONSTRAINT raw_lead_staging_duplicate_of_lead_id_fkey
        FOREIGN KEY (duplicate_of_lead_id)
        REFERENCES leads(id)
        ON DELETE SET NULL,

    CONSTRAINT raw_lead_staging_lead_id_fkey
        FOREIGN KEY (lead_id)
        REFERENCES leads(id)
        ON DELETE SET NULL,

    CONSTRAINT raw_lead_staging_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_batch_id
    ON raw_lead_staging (batch_id);

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_status
    ON raw_lead_staging (status);

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_dedup_key
    ON raw_lead_staging (dedup_key)
    WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_domain
    ON raw_lead_staging (domain)
    WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_contact_email
    ON raw_lead_staging (contact_email)
    WHERE contact_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_lead_staging_lead_id
    ON raw_lead_staging (lead_id)
    WHERE lead_id IS NOT NULL;


-- ============================================================
-- 3. Extend Companies Table
-- Add nullable phone, city, country columns for location and direct contact
-- ============================================================

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS city VARCHAR(100);

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS country VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_companies_city
    ON companies (city)
    WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_country
    ON companies (country)
    WHERE country IS NOT NULL;


-- ============================================================
-- 4. Extend Leads Table
-- Add nullable ingestion_batch_id foreign key for source batch correlation
-- ============================================================

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS ingestion_batch_id UUID;

ALTER TABLE leads
    DROP CONSTRAINT IF EXISTS leads_ingestion_batch_id_fkey;

ALTER TABLE leads
    ADD CONSTRAINT leads_ingestion_batch_id_fkey
    FOREIGN KEY (ingestion_batch_id)
    REFERENCES ingestion_batches(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_ingestion_batch_id
    ON leads (ingestion_batch_id)
    WHERE ingestion_batch_id IS NOT NULL;
