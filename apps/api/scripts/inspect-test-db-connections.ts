import { Pool } from "pg";
import "dotenv/config";

const p = new Pool({
  connectionString: process.env.DATABASE_URL
});

p.query(`
  SELECT pid, usename, application_name, client_addr, state, query
  FROM pg_stat_activity
  WHERE datname LIKE 'operix_agreement_acceptance_test_%'
`)
  .then(r => console.log(JSON.stringify(r.rows, null, 2)))
  .finally(() => p.end());
