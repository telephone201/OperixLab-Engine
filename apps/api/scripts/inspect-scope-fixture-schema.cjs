const { Client } = require("pg");
require("dotenv").config({ path: "../../config/.env" });

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'requirements_confirmations',
        'scope_baselines'
      )
    ORDER BY table_name, ordinal_position
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});