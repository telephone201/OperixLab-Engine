require('dotenv').config({ path: 'D:/OperixLabs Engine/config/.env' });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'requirements_confirmations' ORDER BY indexname"
  );
  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});