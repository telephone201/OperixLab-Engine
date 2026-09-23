const { Client } = require("pg");
require("dotenv").config({ path: "D:\\OperixLabs Engine\\config\\.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = [
    "companies",
    "contacts",
    "leads",
    "solutions",
    "solution_architectures",
    "workflow_versions",
    "commercial_packages",
    "pricing_recommendations",
    "offer_options",
    "proposals",
    "proposal_versions",
    "commercial_agreements",
    "payments",
    "contracts",
    "projects"
  ];

  for (const table of tables) {
    const result = await client.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `, [table]);

    console.log("\\n[" + table + "]");
    console.log(JSON.stringify(result.rows, null, 2));
  }

  await client.end();
})();
