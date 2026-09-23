const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE agreement_id IS NULL)::int AS null_agreement_payments,
        COUNT(*) FILTER (WHERE proposal_id IS NULL)::int AS null_proposal_payments
      FROM payments
    `);
    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await client.end();
  }
})();
