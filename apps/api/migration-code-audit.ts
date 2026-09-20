import fs from 'fs';
import path from 'path';

const migrationsDir = path.resolve('./migrations');

const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort((a, b) => {
    const na = parseInt(a.match(/^\d+/)?.[0] || '0', 10);
    const nb = parseInt(b.match(/^\d+/)?.[0] || '0', 10);
    return na - nb;
  });

const tableMap = new Map<string, string[]>();

for (const file of migrationFiles) {
  const content = fs.readFileSync(
    path.join(migrationsDir, file),
    'utf8'
  ).replace(/^\uFEFF/, '');

  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const table = match[1].toLowerCase();

    if (!tableMap.has(table)) {
      tableMap.set(table, []);
    }

    tableMap.get(table)!.push(file);
  }
}

const codeReferences = [
  'acceptance_records',
  'activation_records',
  'change_request_impact_analysis',
  'commercial_agreement_acceptances',
  'commercial_agreements',
  'commercial_packages',
  'completion_readiness',
  'completion_reviews',
  'delivery_milestone_dependencies',
  'delivery_milestones',
  'delivery_plans',
  'delivery_task_dependencies',
  'delivery_tasks',
  'deployment_manifests',
  'deployment_snapshots',
  'deployment_verifications',
  'engagement_events',
  'governance_approvals',
  'handover_items',
  'handovers',
  'human_overrides',
  'intent_states',
  'known_good_versions',
  'pain_analyses',
  'pain_relationships',
  'payment_readiness',
  'project_closure_snapshots',
  'proposal_engagement_state',
  'qualification_results',
  'qualifications',
  'requirements_analyses',
  'requirements_confirmation_items',
  'requirements_confirmations',
  'research_data',
  'research_requests',
  'review_feedback',
  'review_findings',
  'review_items',
  'review_sessions',
  'rollback_operations',
  'rollback_snapshots',
  'scope_baselines',
  'scope_items',
  'support_readiness',
  'support_transitions',
  'validation_findings',
  'workflow_artifacts',
  'workflow_compatibility_checks',
  'workflow_deployments',
  'workflow_environment_bindings',
  'workflow_lifecycle_transitions',
  'workflow_validations',
  'workflow_versions'
].sort();

console.log('');
console.log('============================================================');
console.log('OPERIX CODE → MIGRATION COVERAGE AUDIT');
console.log('============================================================');
console.log('');

for (const table of codeReferences) {
  const migrations = tableMap.get(table);

  if (migrations && migrations.length > 0) {
    console.log(`[MIGRATION] ${table.padEnd(40)} -> ${migrations.join(', ')}`);
  } else {
    console.log(`[NO MIGRATION] ${table}`);
  }
}

console.log('');
console.log('============================================================');
console.log('ALL TABLES CREATED BY MIGRATIONS');
console.log('============================================================');
console.log('');

for (const [table, migrations] of [...tableMap.entries()].sort()) {
  console.log(`${table.padEnd(45)} -> ${migrations.join(', ')}`);
}

console.log('');
console.log('============================================================');
console.log('SUMMARY');
console.log('============================================================');
console.log('');

const covered = codeReferences.filter(t => tableMap.has(t));
const uncovered = codeReferences.filter(t => !tableMap.has(t));

console.log(`Code tables checked:        ${codeReferences.length}`);
console.log(`Covered by migrations:      ${covered.length}`);
console.log(`WITHOUT migration:          ${uncovered.length}`);

if (uncovered.length > 0) {
  console.log('');
  console.log('Tables referenced by code but NOT created by any migration:');
  for (const table of uncovered) {
    console.log(`  [NO MIGRATION] ${table}`);
  }
}

console.log('');
