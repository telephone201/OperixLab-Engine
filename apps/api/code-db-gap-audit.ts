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
  const srcDir = path.resolve('./src');
  const files = walk(srcDir);

  const tables = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    const regex = /\bdb\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];

      const ignored = new Set([
        'query',
        'transaction',
        'table',
        'connect',
        'release'
      ]);

      if (!ignored.has(name)) {
        tables.add(name);
      }
    }
  }

  const tableNames = [...tables].sort();

  const result = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);

  const existing = new Set(
    result.rows.map((r: { table_name: string }) => r.table_name)
  );

  console.log('\\n============================================================');
  console.log('OPERIX CODE → DATABASE TABLE GAP AUDIT');
  console.log('============================================================\\n');

  console.log(`Tables referenced by code: ${tableNames.length}`);
  console.log(`Database tables found:     ${existing.size}\\n`);

  const missing: string[] = [];
  const present: string[] = [];

  for (const table of tableNames) {
    if (existing.has(table)) {
      present.push(table);
    } else {
      missing.push(table);
    }
  }

  console.log('==================== PRESENT ====================\\n');

  for (const table of present) {
    console.log(`[OK]      ${table}`);
  }

  console.log('\\n==================== MISSING ====================\\n');

  for (const table of missing) {
    console.log(`[MISSING] ${table}`);
  }

  console.log('\\n==================== SUMMARY ====================\\n');

  console.log(`PRESENT: ${present.length}`);
  console.log(`MISSING: ${missing.length}`);

  console.log('\\n==================== ALL CODE REFERENCES ====================\\n');

  for (const table of tableNames) {
    console.log(table);
  }
}

main()
  .catch(err => {
    console.error('\\nAUDIT FAILED:', err.message);
    process.exit(1);
  });
