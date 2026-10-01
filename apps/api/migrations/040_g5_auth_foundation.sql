-- G5.1 Auth foundation
-- New migration only. Do not modify historical migrations.

CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT app_users_email_unique UNIQUE (email),
    CONSTRAINT app_users_role_check
        CHECK (role IN ('OWNER', 'OPERATOR', 'VIEWER'))
);

CREATE INDEX idx_app_users_active
    ON app_users (is_active);

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT auth_sessions_token_hash_unique UNIQUE (token_hash),
    CONSTRAINT auth_sessions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES app_users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_auth_sessions_user
    ON auth_sessions (user_id);

CREATE INDEX idx_auth_sessions_active
    ON auth_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;
