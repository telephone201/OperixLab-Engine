require('dotenv').config({ path: 'D:/OperixLabs Engine/config/.env' });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(
    "SELECT status, COUNT(*)::int AS count FROM requirements_confirmations GROUP BY status ORDER BY status"
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});