import { Pool } from "pg";
import { config } from "../src/config/config-manager";

async function run() {
    const pool = new Pool({
        connectionString: config.get("databaseUrl").replace(/\/([^\/]+)$/, "/postgres")
    });

    const dbName = "operix_agreement_acceptance_test_1790071982877";

    try {
        await pool.query(
            `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
             WHERE datname = $1
               AND pid <> pg_backend_pid()`,
            [dbName]
        );

        await pool.query(`DROP DATABASE IF EXISTS "${dbName}"`);

        console.log(`CLEANUP=PASSED:${dbName}`);
    } finally {
        await pool.end();
    }
}

run().catch(error => {
    console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
