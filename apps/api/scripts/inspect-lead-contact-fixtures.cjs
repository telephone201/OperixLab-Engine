const { Client } = require("pg");
require("dotenv").config({ path: "D:/OperixLabs Engine/config/.env" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const r = await c.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('leads', 'contacts')
    ORDER BY table_name, ordinal_position
  `);

  let current = "";
  for (const row of r.rows) {
    if (row.table_name !== current) {
      current = row.table_name;
      console.log("\\nTABLE:", current);
    }
    console.log(
      row.column_name +
      ": " + row.data_type +
      " | nullable=" + row.is_nullable +
      " | default=" + (row.column_default || "NONE")
    );
  }

  await c.end();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
