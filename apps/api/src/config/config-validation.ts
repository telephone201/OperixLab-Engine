/**
 * @file config-validation.ts
 * @description G1 configuration foundation: portable environment-file
 * resolution and fail-fast configuration validation.
 *
 * SECURITY CONTRACT:
 * - Validation errors identify the configuration VARIABLE by name.
 * - Validation errors NEVER include configuration VALUES (no connection
 *   strings, no secrets, no payment identifiers).
 * - Resolved file paths are not printed; callers only learn whether an
 *   environment file was found.
 *
 * ENVIRONMENT FILE RESOLUTION ORDER (G1):
 *   1. CONFIG_ENV_PATH (explicit override; absolute or relative to CWD).
 *   2. <repository root>/config/.env (resolved from this module's location,
 *      independent of CWD and of any machine-specific absolute path).
 *   3. No file: process environment is used as-is (dotenv is not invoked,
 *      so no unexpected .env files are loaded).
 */

import fs from 'fs';
import path from 'path';

export class ConfigValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CONFIG_VALIDATION_ERROR';
    }
}

/**
 * Resolves the environment file per the documented resolution order.
 * Throws only when an explicitly requested CONFIG_ENV_PATH does not exist.
 * Returns null when no environment file is present (process env is used).
 */
export function resolveEnvFile(): string | null {
    const override = process.env.CONFIG_ENV_PATH;

    if (override !== undefined && override.trim() !== '') {
        const resolved = path.resolve(override.trim());
        if (!fs.existsSync(resolved)) {
            throw new ConfigValidationError(
                'CONFIG_ENV_PATH points to a file that does not exist.'
            );
        }
        return resolved;
    }

    // apps/api/src/config -> repository root is four levels up.
    const repoEnvPath = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'config',
        '.env'
    );

    if (fs.existsSync(repoEnvPath)) {
        return repoEnvPath;
    }

    return null;
}

/**
 * Fails fast when a required configuration variable is missing or empty.
 * The error names the variable only.
 */
export function requireNonEmptyConfig(
    name: string,
    value: string | undefined
): string {
    if (value === undefined || value.trim() === '') {
        throw new ConfigValidationError(
            `${name} is required and must not be empty.`
        );
    }
    return value;
}

/**
 * DATABASE_URL must be present and a structurally valid PostgreSQL URL.
 * On any failure the value itself is never echoed back.
 */
export function validateDatabaseUrl(raw: string | undefined): string {
    const value = requireNonEmptyConfig('DATABASE_URL', raw);

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new ConfigValidationError(
            'DATABASE_URL is malformed (expected a postgres:// or postgresql:// connection URL).'
        );
    }

    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
        throw new ConfigValidationError(
            'DATABASE_URL is malformed (expected a postgres:// or postgresql:// connection URL).'
        );
    }

    if (!parsed.hostname) {
        throw new ConfigValidationError(
            'DATABASE_URL is malformed (missing database host).'
        );
    }

    return value;
}

/**
 * G1: the unsafe `'dev-secret'` fallback is removed. APP_SECRET currently has
 * no consumer in the codebase, so it stays optional; however a value that is
 * explicitly set must not be weak in production. Opaque-session auth (G4/G5)
 * will not depend on APP_SECRET at all.
 */
export function validateAppSecret(nodeEnv: string, raw: string): string {
    if (nodeEnv === 'production' && raw !== '' && raw.length < 32) {
        throw new ConfigValidationError(
            'APP_SECRET is set but too weak for production (minimum 32 characters).'
        );
    }
    return raw;
}

/**
 * Preserves existing PORT behavior while failing fast on garbage values.
 * Legacy semantics: PORT unset/empty/0 resolved to the 3000 default
 * (the old `config.get('port') || 3000` treated 0 as unset). Other
 * non-numeric or out-of-range values now fail fast instead of failing
 * obscurely later.
 */
export function validatePort(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') {
        return 3000;
    }
    const port = Number.parseInt(raw, 10);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new ConfigValidationError(
            'PORT must be an integer between 1 and 65535.'
        );
    }
    return port === 0 ? 3000 : port;
}
/**
 * Validates CORS origins.
 * Development may omit CORS_ORIGINS.
 * Production must explicitly define allowed origins.
 */
export function validateCorsOrigins(
    nodeEnv: string,
    raw: string | undefined
): string[] {
    const value = raw?.trim() || '';

    if (nodeEnv === 'production' && value === '') {
        throw new ConfigValidationError(
            'CORS_ORIGINS is required in production. Refusing to start with unrestricted CORS.'
        );
    }

    if (value === '') {
        return [];
    }

    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        throw new ConfigValidationError(
            'CORS_ORIGINS must contain at least one valid origin.'
        );
    }

    return origins;
}