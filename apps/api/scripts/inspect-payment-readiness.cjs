const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE proposal_id IS NULL)::int AS null_proposal,
      COUNT(*) FILTER (WHERE agreement_id IS NULL)::int AS null_agreement,
      COUNT(DISTINCT agreement_id)::int AS distinct_agreements
    FROM payment_readiness
  `);
  console.log(JSON.stringify(result.rows[0], null, 2));
  await client.end();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
