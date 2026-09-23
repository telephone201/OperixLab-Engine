import { Pool } from "pg";

async function run() {
    const dotenv = await import("dotenv");
    dotenv.config({ path: "D:/OperixLabs Engine/config/.env" });

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

    const pool = new Pool({ connectionString: databaseUrl });

    try {
        const result = await pool.query(`
            SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
             AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = 'commercial_packages'
            ORDER BY kcu.ordinal_position
        `);

        console.log(JSON.stringify(result.rows, null, 2));
    } finally {
        await pool.end();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});