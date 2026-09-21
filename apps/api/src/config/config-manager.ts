/**
 * @file config-manager.ts
 * @description Handles application configuration and environment variable access.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('D:/OperixLabs Engine/config/.env') });

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
    gmailClientId: string;
    gmailClientSecret: string;
    gmailRefreshToken: string;
    instapayVerificationUrl: string;
    appSecret: string;
}

export class ConfigurationManager {
    private config: AppConfig;

    constructor() {
        this.config = {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: parseInt(process.env.PORT || '3000', 10),
            databaseUrl: process.env.DATABASE_URL || '',
            redisUrl: process.env.REDIS_URL || '',
            firstCustomerMode: process.env.FIRST_CUSTOMER_MODE === 'true',
            zeroCostMode: process.env.ZERO_COST_MODE === 'true',
            ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            n8nBaseUrl: process.env.N8N_BASE_URL || '',
            n8nApiKey: process.env.N8N_API_KEY || '',
            gmailClientId: process.env.GMAIL_CLIENT_ID || '',
            gmailClientSecret: process.env.GMAIL_CLIENT_SECRET || '',
            gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
            instapayVerificationUrl: process.env.INSTAPAY_VERIFICATION_URL || '',
            appSecret: process.env.APP_SECRET || 'dev-secret'
        };
    }

    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    public get all(): AppConfig {
        return this.config;
    }
}

export const config = new ConfigurationManager();
