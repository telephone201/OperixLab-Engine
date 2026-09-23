const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(`
    SELECT
      constraint_name,
      constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = 'payment_readiness'
    ORDER BY constraint_type, constraint_name
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
