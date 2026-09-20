/**
 * @file migration-runner.ts
 * @description Deterministic migration runner for applying SQL migrations.
 */

import fs from 'fs';
import path from 'path';
import { db } from '../../lib/db';
import { config } from '../../config/config-manager';

export interface MigrationRecord {
    migration_name: string;
    applied_at: Date;
    checksum: string;
}

export class MigrationRunner {
    private readonly migrationsDir = path.resolve('D:/OperixLabs Engine/apps/api/migrations');

    /**
     * Ensures the migrations_history table exists.
     */
    async ensureHistoryTable() {
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations_history (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT NOT NULL
            );
        `);
    }

    /**
     * Computes a simple checksum for a file to detect modifications.
     */
    private async computeChecksum(content: string): Promise<string> {
        const crypto = await import('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Discovers and sorts migration files.
     */
    private async getMigrations() {
        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        return files;
    }

    /**
     * Applies all pending migrations in order.
     */
    async up() {
        console.log('[MIGRATION] Starting migration process...');
        await this.ensureHistoryTable();

        const files = await this.getMigrations();
        const applied = await db.query('SELECT migration_name, checksum FROM migrations_history');
        const appliedMap = new Map(applied.rows.map((r: { migration_name: string; checksum: string }) => [r.migration_name, r.checksum]));

        let appliedCount = 0;
        let errorOccurred = false;

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');
            const checksum = await this.computeChecksum(content);

            if (appliedMap.has(file)) {
                const oldChecksum = appliedMap.get(file);
                if (oldChecksum !== checksum) {
                    console.error(`[MIGRATION] CRITICAL: Migration ${file} has been modified after application!`);
                    console.error(`Expected: ${oldChecksum}`);
                    console.error(`Actual:   ${checksum}`);
                    errorOccurred = true;
                    break;
                }
                // Skip already applied
                continue;
            }

            console.log(`[MIGRATION] Applying ${file}...`);
            try {
                await db.transaction(async (client) => {
                    await client.query(content);
                    await client.query(
                        'INSERT INTO migrations_history (migration_name, checksum) VALUES ($1, $2)',
                        [file, checksum]
                    );
                });
                appliedCount++;
            } catch (e: any) {
                console.error(`[MIGRATION] Failed to apply ${file}: ${e.message}`);
                errorOccurred = true;
                break;
            }
        }

        if (errorOccurred) {
            throw new Error('[MIGRATION] Migration process failed.');
        }

        console.log(`[MIGRATION] Successfully applied ${appliedCount} new migrations.`);
        return { appliedCount };
    }

    /**
     * Checks the status of all migrations.
     */
    async status() {
        await this.ensureHistoryTable();
        const files = await this.getMigrations();
        const applied = await db.query('SELECT migration_name FROM migrations_history');
        const appliedSet = new Set(applied.rows.map((r: { migration_name: string }) => r.migration_name));

        const status = files.map(f => ({
            name: f,
            applied: appliedSet.has(f)
        }));

        return status;
    }
}

export const migrationRunner = new MigrationRunner();
