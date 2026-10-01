-- Chat v1 instruction persistence
-- New migration only. Do not modify historical migrations.

CREATE TABLE chat_instructions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    instruction_text  TEXT NOT NULL,
    intent            VARCHAR(50) NOT NULL,
    plan              JSONB NOT NULL DEFAULT '{}'::jsonb,
    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    result            JSONB,
    error             TEXT,
    confirmed_by      UUID,
    confirmed_at      TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chat_instructions_status_check
        CHECK (
            status IN (
                'DRAFT',
                'CONFIRMED',
                'RUNNING',
                'WAITING_REVIEW',
                'COMPLETED',
                'FAILED'
            )
        ),

    CONSTRAINT chat_instructions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES app_users(id),

    CONSTRAINT chat_instructions_confirmer_fk
        FOREIGN KEY (confirmed_by)
        REFERENCES app_users(id)
);

CREATE INDEX idx_chat_instructions_user
    ON chat_instructions (user_id, created_at);

CREATE INDEX idx_chat_instructions_status
    ON chat_instructions (status);
