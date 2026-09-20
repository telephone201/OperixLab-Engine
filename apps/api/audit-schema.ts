import { db } from './src/lib/db';

async function main() {
  const tables = [
    'research_versions',
    'research_evidence',
    'qualification',
    'qualifications',
    'score_components',
    'requirements',
    'requirements_analyses',
    'pain_analyses',
    'pricing_recommendations',
    'offer_options',
    'proposals',
    'proposal_versions',
    'commercial_agreements',
    'commercial_agreement_versions',
    'payments',
    'payment_readiness',
    'workflow_versions',
    'solution_architectures',
    'solution_versions'
  ];

  console.log('\\n===== TABLE / COLUMN AUDIT =====\\n');

  const result = await db.query(`
    SELECT
      c.table_name,
      c.ordinal_position,
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = ANY($1)
    ORDER BY c.table_name, c.ordinal_position
  `, [tables]);

  let current = '';

  for (const row of result.rows) {
    if (row.table_name !== current) {
      current = row.table_name;
      console.log(`\\n--- ${current} ---`);
    }

    console.log(
      `${row.column_name} | ${row.data_type} | ${row.udt_name} | nullable=${row.is_nullable} | default=${row.column_default ?? 'NULL'}`
    );
  }

  console.log('\\n===== FOREIGN KEY AUDIT =====\\n');

  const fk = await db.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ANY($1)
    ORDER BY tc.table_name, kcu.column_name
  `, [tables]);

  for (const row of fk.rows) {
    console.log(
      `${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name} | ON DELETE ${row.delete_rule}`
    );
  }
}

main()
  .catch(err => {
    console.error('\\nAUDIT FAILED:', err.message);
    process.exit(1);
  });
