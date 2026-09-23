const { Client } = require("pg");
require("dotenv").config({ path: "../../config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(`
    SELECT entity_id, approval_type, COUNT(*)::int AS pending_count
    FROM governance_approvals
    WHERE status = 'PENDING'
    GROUP BY entity_id, approval_type
    HAVING COUNT(*) > 1
    ORDER BY pending_count DESC
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
