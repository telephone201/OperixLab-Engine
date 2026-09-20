/**
 * @file phase-5-verification-report.js
 * @description Direct execution script to verify Phase 5 logic without TS dependencies.
 */

const {
    ScoreComponentCalculator,
    DEFAULT_WEIGHTS
} = require('./apps/api/src/services/qualification/score-component-calculator-js');

const { QualificationClassifier } = require('./apps/api/src/services/qualification/qualification-classifier-js');
const { IntentManager } = require('./apps/api/src/services/qualification/intent-manager-js');
const { NotificationRuleEngine } = require('./apps/api/src/services/qualification/notification-rule-engine-js');

async function runTests() {
    const calc = new ScoreComponentCalculator();
    const classifier = new QualificationClassifier();
    const intent = new IntentManager();
    const rules = new NotificationRuleEngine();

    const results = [];

    // 1. Score Verification
    console.log('Running Score Verification...');
    const components = [
        calc.calculate('ICP Fit', { industry: 'AI', targetIndustry: ['AI'] }, DEFAULT_WEIGHTS.icpFit),
        calc.calculate('Automation Opportunity', { automationSignals: [{ value: true }] }, DEFAULT_WEIGHTS.automationOpportunity),
        calc.calculate('Decision Maker', { decisionMaker: { verified_status: 'VERIFIED' } }, DEFAULT_WEIGHTS.decisionMaker),
        calc.calculate('Commercial Potential', { employeeCount: 100 }, DEFAULT_WEIGHTS.commercialPotential),
        calc.calculate('Data Confidence', { evidenceCount: 10 }, DEFAULT_WEIGHTS.dataConfidence),
        calc.calculate('Demo Potential', { websiteQuality: 'HIGH' }, DEFAULT_WEIGHTS.demoPotential),
    ];
    const total = components.reduce((s, c) => s + c.score, 0);
    results.push({ test: 'Total Score Max', pass: total === 100 });

    // 2. Classification Verification
    const qual = classifier.classify('l1', components);
    results.push({ test: 'Priority A Label', pass: qual.label === 'PRIORITY_A' });

    // 3. Intent State Machine
    const state = { leadId: 'l1', state: 'NO_SIGNAL', score: 0, confidence: 0, lastUpdated: new Date() };
    const event = { eventType: 'READY_TO_BUY' };
    const newState = await intent.processEvent(event, state);
    results.push({ test: 'READY_TO_BUY -> HOT', pass: newState.state === 'HOT' });

    // 4. Notification Rules
    const actions = rules.evaluate('NO_SIGNAL', 'HOT');
    results.push({ test: 'HOT -> NOTIFY_OWNER', pass: actions.includes('NOTIFY_OWNER') });

    console.log(results);
    process.exit(results.every(r => r.pass) ? 0 : 1);
}

runTests();
