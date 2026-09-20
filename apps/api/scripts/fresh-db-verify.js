const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Hardcoded for verification as config-manager is TS and requires ts-node
// I'll attempt to read the environment if available, otherwise I will use a placeholder 
// for the report to show the BLOCKED status based on runtime failure.
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

async function run() {
    console.log("[FRESH_DB] Starting verification with URL: " + dbUrl);
    const adminPool = new Pool({ connectionString: dbUrl });

    const testDbName = "operix_gate1_test_" + Date.now();
    
    try {
        console.log(`[FRESH_DB] Creating isolated database: ${testDbName}...`);
        await adminPool.query(`CREATE DATABASE ${testDbName}`);
        
        const testDbUrl = dbUrl.replace(/\/([^\/]+)$/, "/" + testDbName);
        const testPool = new Pool({ connectionString: testDbUrl });

        console.log(`[FRESH_DB] Running migrations on ${testDbName}...`);
        
        const migrationsDir = path.resolve("D:/OperixLabs Engine/apps/api/migrations");
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith(".sql"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

        await testPool.query(`
            CREATE TABLE IF NOT EXISTS migrations_history (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT NOT NULL
            );
        `);

        for (const file of files) {
            const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
            console.log(`[FRESH_DB] Applying ${file}...`);
            await testPool.query("BEGIN");
            try {
                await testPool.query(content);
                await testPool.query(
                    "INSERT INTO migrations_history (migration_name, checksum) VALUES ($1, $2)",
                    [file, "checksum_placeholder"]
                );
                await testPool.query("COMMIT");
            } catch (e) {
                await testPool.query("ROLLBACK");
                console.error(`[FAIL] Migration ${file} failed: ${e.message}`);
                process.exit(1);
            }
        }

        const res = await testPool.query("SELECT count(*) FROM migrations_history");
        const count = parseInt(res.rows[0].count);
        console.log(`[FRESH_DB] Successfully applied ${count} migrations.`);
        
        if (count === files.length) {
            console.log("FRESH_DB_MIGRATION=PASSED");
        } else {
            console.log(`[FAIL] Migration count mismatch: Expected ${files.length}, got ${count}`);
            process.exit(1);
        }

        await testPool.end();
    } catch (e) {
        console.error(`[FATAL] ${e.message}`);
        process.exit(1);
    } finally {
        await adminPool.end();
    }
}

run();
