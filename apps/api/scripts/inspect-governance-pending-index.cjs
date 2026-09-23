const { Client } = require("pg");
require("dotenv").config({ path: "../../config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'governance_approvals'
      AND indexname = 'ux_governance_approvals_pending_entity_type'
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});