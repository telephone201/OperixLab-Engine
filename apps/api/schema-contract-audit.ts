import fs from 'fs';
import path from 'path';
import { db } from './src/lib/db';

function walk(dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        results.push(...walk(full));
      }
    } else if (/\.(ts|js)$/.test(entry.name)) {
      results.push(full);
    }
  }

  return results;
}

async function main() {
  const files = walk(path.resolve('./src'));

  const tableRefs = new Map<string, Set<string>>();

  /*
   * Detect common patterns such as:
   *
   * db.proposals.create({
   * db.proposals.findUnique({
   * db.payments.update({
   * db.requirements.findMany({
   *
   * This audit first identifies every db.<table> reference.
   */

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    const regex = /\bdb\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const table = match[1];

      const ignored = new Set([
        'query',
        'transaction',
        'table',
        'connect',
        'release'
      ]);

      if (!ignored.has(table)) {
        if (!tableRefs.has(table)) {
          tableRefs.set(table, new Set());
        }

        tableRefs.get(table)!.add(file);
      }
    }
  }

  const result = await db.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      udt_name,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const dbSchema = new Map<
    string,
    Array<{
      column: string;
      dataType: string;
      udtName: string;
      nullable: string;
    }>
  >();

  for (const row of result.rows) {
    if (!dbSchema.has(row.table_name)) {
      dbSchema.set(row.table_name, []);
    }

    dbSchema.get(row.table_name)!.push({
      column: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable
    });
  }

  console.log('');
  console.log('============================================================');
  console.log('OPERIX CODE ↔ DATABASE SCHEMA CONTRACT AUDIT');
  console.log('============================================================');
  console.log('');

  console.log(`Code table references: ${tableRefs.size}`);
  console.log(`Database tables:       ${dbSchema.size}`);
  console.log('');

  console.log('==================== CODE TABLE REFERENCES ====================');
  console.log('');

  for (const [table, filesUsing] of [...tableRefs.entries()].sort()) {
    const exists = dbSchema.has(table);

    console.log(
      `${exists ? '[DB OK]   ' : '[DB MISS] '}${table}`
    );

    if (exists) {
      console.log(
        `           Columns: ${dbSchema.get(table)!.map(c => c.column).join(', ')}`
      );
    }

    console.log(
      `           Files: ${[...filesUsing]
        .map(f => path.relative(process.cwd(), f))
        .join(' | ')}`
    );

    console.log('');
  }

  console.log('');
  console.log('==================== CRITICAL EXISTING SCHEMA ====================');
  console.log('');

  const criticalTables = [
    'qualification',
    'qualifications',
    'qualification_results',
    'score_components',
    'requirements',
    'requirements_analyses',
    'pain_analysis',
    'pain_analyses',
    'pricing_recommendations',
    'offer_options',
    'proposals',
    'proposal_versions',
    'payments',
    'commercial_packages',
    'commercial_agreements',
    'payment_readiness',
    'workflow_library',
    'workflow_versions',
    'solution_versions',
    'projects'
  ];

  for (const table of criticalTables) {
    console.log(`--- ${table} ---`);

    const columns = dbSchema.get(table);

    if (!columns) {
      console.log('  [MISSING]');
    } else {
      for (const c of columns) {
        console.log(
          `  ${c.column} | ${c.dataType} | ${c.udtName} | nullable=${c.nullable}`
        );
      }
    }

    console.log('');
  }

  console.log('');
  console.log('==================== MIGRATION TABLE COLLISIONS ====================');
  console.log('');

  const migrationFiles = fs.readdirSync(
    path.resolve('./migrations')
  )
    .filter(f => f.endsWith('.sql'))
    .sort();

  const migrationTables = new Map<string, string[]>();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(
      path.resolve('./migrations', file),
      'utf8'
    ).replace(/^\uFEFF/, '');

    const regex =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const table = match[1].toLowerCase();

      if (!migrationTables.has(table)) {
        migrationTables.set(table, []);
      }

      migrationTables.get(table)!.push(file);
    }
  }

  for (const [table, filesForTable] of [...migrationTables.entries()].sort()) {
    if (filesForTable.length > 1 && dbSchema.has(table)) {
      console.log(
        `[COLLISION] ${table} -> ${filesForTable.join(', ')}`
      );
    }
  }

  console.log('');
  console.log('============================================================');
  console.log('END OF AUDIT');
  console.log('============================================================');
  console.log('');
}

main().catch(err => {
  console.error('');
  console.error('AUDIT FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
