import { Pool } from "pg";

async function run() {
    const dotenv = await import("dotenv");
    dotenv.config({ path: "D:/OperixLabs Engine/config/.env" });

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

    const pool = new Pool({ connectionString: databaseUrl });

    try {
        for (const table of ["solution_architectures", "workflow_versions"]) {
            const result = await pool.query(`
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = $1
                ORDER BY ordinal_position
            `, [table]);

            console.log(`\\n=== ${table} ===`);
            console.log(JSON.stringify(result.rows, null, 2));
        }
    } finally {
        await pool.end();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});