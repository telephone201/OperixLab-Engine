import { Pool } from "pg";
import { config } from "../src/config/config-manager";

async function run() {
    const databaseUrl = config.get("databaseUrl");

    const pool = new Pool({
        connectionString: databaseUrl.replace(/\/([^\/]+)$/, "/postgres")
    });

    try {
        const result = await pool.query(
            "SELECT datname FROM pg_database WHERE datname LIKE 'operix_agreement_acceptance_test_%'"
        );

        console.log(result.rows);
    } finally {
        await pool.end();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
