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

  for (const table of tables) {
    const r = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    console.log("\\nTABLE:", table);
    console.log(r.rows.map(x => `${x.column_name}: ${x.data_type}`).join("\\n"));
  }

  await c.end();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
