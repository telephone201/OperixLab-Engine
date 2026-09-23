const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = [
    "commercial_packages",
    "proposal_versions",
    "commercial_agreements",
    "payments",
    "payment_readiness"
  ];

  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    console.log(`${table}=${result.rows[0].count}`);
  }

  await client.end();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
