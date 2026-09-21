/**
 * @file parity-check.ts
 * @description Verifies that applying the 21 migration files to a fresh schema 
 * results in a schema identical to the current public schema.
 */

import { db } from '../src/lib/db';
import { migrationRunner } from '../src/services/database/migration-runner';

async function getSchemaSnapshot(schema: string) {
    const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    `;
    const columnsQuery = `
        SELECT table_name, column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_schema = $1
    `;

    const tablesRes = await db.query(tablesQuery, [schema]);
    const columnsRes = await db.query(columnsQuery, [schema]);

    const snapshot: Record<string, any> = {};
    columnsRes.rows.forEach((col: any) => {
        if (!snapshot[col.table_name]) snapshot[col.table_name] = [];
        snapshot[col.table_name].push({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable
        });
    });

    return snapshot;
}

async function run() {
    console.log('[PARITY] Starting Schema Parity Verification...');

    try {
        console.log('[PARITY] Snapshotting operational schema (public)...');
        const operationalSchema = await getSchemaSnapshot('public');

        console.log('[PARITY] Creating isolated test schema (migration_test)...');
        await db.query('DROP SCHEMA IF EXISTS migration_test CASCADE');
        await db.query('CREATE SCHEMA migration_test');

        console.log('[PARITY] Running migrations in test schema...');
        // To force the MigrationRunner to use the test schema, we will manually 
        // execute the files in the test schema for this check.
        const fs = require('fs');
        const path = require('path');
        const migrationsDir = path.resolve('D:/OperixLabs Engine/apps/api/migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter((f: string) => f.endsWith('.sql'))
            .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        for (const file of files) {
            const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await db.transaction(async (client) => {
                await client.query('SET search_path TO migration_test');
                await client.query(content);
            });
        }

        console.log('[PARITY] Comparing schemas...');
        const testSchema = await getSchemaSnapshot('migration_test');

        const operationalTables = Object.keys(operationalSchema);
        const testTables = Object.keys(testSchema);

        const missingTables = operationalTables.filter(t => !testTables.includes(t));
        const extraTables = testTables.filter(t => !operationalTables.includes(t));

        if (missingTables.length > 0) {
            console.error(`[FAIL] Missing tables in test schema: ${missingTables.join(', ')}`);
        }
        if (extraTables.length > 0) {
            console.error(`[FAIL] Extra tables in test schema: ${extraTables.join(', ')}`);
        }

        let columnMismatches = 0;
        for (const table of operationalTables) {
            if (!testSchema[table]) continue;

            const opCols = operationalSchema[table];
            const testCols = testSchema[table];

            if (opCols.length !== testCols.length) {
                console.error(`[FAIL] Table ${table} column count mismatch: Operational=${opCols.length}, Test=${testCols.length}`);
                columnMismatches++;
            } else {
                for (const col of opCols) {
                    const testCol = testCols.find((tc: any) => tc.name === col.name);
                    if (!testCol || testCol.type !== col.type || testCol.nullable !== col.nullable) {
                        console.error(`[FAIL] Table ${table} column ${col.name} mismatch: Operational=${JSON.stringify(col)}, Test=${JSON.stringify(testCol)}`);
                        columnMismatches++;
                    }
                }
            }
        }

        if (missingTables.length === 0 && extraTables.length === 0 && columnMismatches === 0) {
            console.log('[SUCCESS] 100% Schema Parity Verified.');
        } else {
            console.error('[FAIL] Schema parity verification failed.');
        }

    } catch (e: any) {
        console.error('[FATAL] Parity check failed:', e.message);
    } finally {
        await db.query('DROP SCHEMA IF EXISTS migration_test CASCADE');
    }
}

run();
