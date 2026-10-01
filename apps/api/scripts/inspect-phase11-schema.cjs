const { Client } = require('pg');
require('dotenv').config({ path: '../../config/.env' });

(async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
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
        'commercial_packages',
        'pricing_recommendations',
        'offer_options'
      )
    ORDER BY table_name, ordinal_position
  `);

  console.table(result.rows);

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
