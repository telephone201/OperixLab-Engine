/**
 * @file migrate.ts
 * @description CLI entry point for running database migrations.
 */

import { migrationRunner } from '../src/services/database/migration-runner';
import { config } from '../src/config/config-manager';

async function run() {
    const arg = process.argv[2];

    try {
        if (arg === 'up') {
            await migrationRunner.up();
            process.exit(0);
        } else if (arg === 'status') {
            const status = await migrationRunner.status();
            console.log('\\nMigration Status:');
            console.log('--------------------------------------------------');
            status.forEach(s => {
                console.log(`${s.applied ? '[X]' : '[ ]'} ${s.name}`);
            });
            console.log('--------------------------------------------------');
            process.exit(0);
        } else {
            console.log('Usage: ts-node migrate.ts [up|status]');
            process.exit(1);
        }
    } catch (e: any) {
        console.error('\\n[FATAL] Migration failed:', e.message);
        process.exit(1);
    }
}

run();
