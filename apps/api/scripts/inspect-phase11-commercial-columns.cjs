const { Client } = require("pg");
require("dotenv").config({ path: "D:\\OperixLabs Engine\\config\\.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = [
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
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    console.log("\\n[" + table + "]");
    console.log(JSON.stringify(result.rows, null, 2));
  }

  await client.end();
})();
