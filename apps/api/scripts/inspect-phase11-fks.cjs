const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const tables = [
    "commercial_packages",
    "pricing_recommendations",
    "offer_options",
    "proposals",
    "proposal_versions",
    "commercial_agreements",
    "payments",
    "projects"
  ];

  const r = await c.query(`
    SELECT
      tc.table_name,
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
      AND tc.table_name = ANY($1)
    ORDER BY tc.table_name, kcu.column_name
  `, [tables]);

  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
