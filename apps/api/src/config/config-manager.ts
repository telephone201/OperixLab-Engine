/**
 * @file config-manager.ts
 * @description Handles application configuration and environment variable access.
 *
 * G1 (production configuration foundation):
 * - Portable environment-file resolution (CONFIG_ENV_PATH override, then
 *   repository-relative config/.env; no machine-specific absolute path).
 * - Fail-fast validation at module load (invalid configuration aborts the
 *   process before any service initializes).
 * - The unsafe `'dev-secret'` APP_SECRET fallback is removed.
 * - Secret VALUES are never printed or included in errors.
 */

import dotenv from 'dotenv';

import {
    resolveEnvFile,
    validateAppSecret,
    validateCorsOrigins,
    validateDatabaseUrl,
    validatePort
} from './config-validation';

// The resolved path is intentionally NOT logged: knowing the path reveals
// where credentials live without revealing their values.
const envFile = resolveEnvFile();

if (envFile !== null) {
    // quiet: true â€” never print the environment-file path (dotenv default
    // logging would reveal where credentials live).
    dotenv.config({ path: envFile, quiet: true });
}

export interface AppConfig {
    nodeEnv: string;
    port: number;
    databaseUrl: string;
    redisUrl: string;
    firstCustomerMode: boolean;
    zeroCostMode: boolean;
    ollamaBaseUrl: string;
    n8nBaseUrl: string;
    n8nApiKey: string;
    apifyToken: string;
    apifyActorId: string;
    apifyDefaultLocation: string;
    chatDiscoveryProvider: string;
    gmailClientId: string;
    gmailClientSecret: string;
    gmailRefreshToken: string;
    instapayVerificationUrl: string;
    instapayPrimaryIdentifier: string;
    instapayPrimaryUrl: string;
    instapaySecondaryIdentifier: string;
    instapaySecondaryUrl: string;
    appSecret: string;
    corsOrigins: string[];
}

function readString(name: string): string {
    const value = process.env[name];
    return value === undefined ? '' : value;
}

function readBoolean(name: string): boolean {
    return process.env[name] === 'true';
}

function validateConfiguration(): AppConfig {
    const nodeEnv = readString('NODE_ENV') || 'development';
    const port = validatePort(readString('PORT'));

    const databaseUrl = validateDatabaseUrl(readString('DATABASE_URL'));
    const appSecret = validateAppSecret(nodeEnv, readString('APP_SECRET'));
    const corsOrigins = validateCorsOrigins(nodeEnv, readString('CORS_ORIGINS'));

    return {
        nodeEnv,
        port,
        databaseUrl,
        redisUrl: readString('REDIS_URL'),
        firstCustomerMode: readBoolean('FIRST_CUSTOMER_MODE'),
        zeroCostMode: readBoolean('ZERO_COST_MODE'),
        // Preserved local-development default (local Ollama endpoint only).
        ollamaBaseUrl: readString('OLLAMA_BASE_URL') || 'http://localhost:11434',
        n8nBaseUrl: readString('N8N_BASE_URL'),
        n8nApiKey: readString('N8N_API_KEY'),
        apifyToken: readString('APIFY_TOKEN'),
        apifyActorId: readString('APIFY_ACTOR_ID') || 'compass/crawler-google-places',
    apifyDefaultLocation: readString('APIFY_DEFAULT_LOCATION'),
        chatDiscoveryProvider: readString('CHAT_DISCOVERY_PROVIDER'),
        gmailClientId: readString('GMAIL_CLIENT_ID'),
        gmailClientSecret: readString('GMAIL_CLIENT_SECRET'),
        gmailRefreshToken: readString('GMAIL_REFRESH_TOKEN'),
        instapayVerificationUrl: readString('INSTAPAY_VERIFICATION_URL'),
        instapayPrimaryIdentifier: readString('INSTAPAY_PRIMARY_IDENTIFIER'),
        instapayPrimaryUrl: readString('INSTAPAY_PRIMARY_URL'),
        instapaySecondaryIdentifier: readString('INSTAPAY_SECONDARY_IDENTIFIER'),
        instapaySecondaryUrl: readString('INSTAPAY_SECONDARY_URL'),
        appSecret,
        corsOrigins
    };
}

export class ConfigurationManager {
    private config: AppConfig;

    constructor() {
        this.config = validateConfiguration();
    }

    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    public get all(): AppConfig {
        return this.config;
    }
}

export const config = new ConfigurationManager();




