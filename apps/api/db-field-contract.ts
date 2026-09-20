import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('./src');

function walk(dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') results.push(...walk(full));
    } else if (/\.(ts|js)$/.test(entry.name)) {
      results.push(full);
    }
  }

  return results;
}

const files = walk(srcDir);

const targets = [
  'commercial_agreement_acceptances',
  'intent_states',
  'qualification_results',
  'research_data',
  'research_requests',
  'qualifications',
  'requirements_analyses',
  'pain_analyses',
  'commercial_packages',
  'payment_readiness',
  'workflow_versions',
  'workflow_deployments',
  'workflow_validations',
  'workflow_artifacts',
  'proposals',
  'proposal_versions',
  'pricing_recommendations',
  'offer_options',
  'payments'
];

console.log('');
console.log('============================================================');
console.log('OPERIX DATABASE FIELD CONTRACT EXTRACTION');
console.log('============================================================');

for (const target of targets) {
  console.log('');
  console.log(`==================== ${target} ====================`);

  let found = false;

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.includes(`db.${target}`)) continue;

      found = true;

      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 25);

      console.log('');
      console.log(`--- ${path.relative(process.cwd(), file)}:${i + 1} ---`);

      for (let j = start; j <= end; j++) {
        console.log(
          `${String(j + 1).padStart(5, ' ')} | ${lines[j]}`
        );
      }
    }
  }

  if (!found) {
    console.log('[NO DIRECT CODE REFERENCE FOUND]');
  }
}

console.log('');
console.log('============================================================');
console.log('END');
console.log('============================================================');
console.log('');
