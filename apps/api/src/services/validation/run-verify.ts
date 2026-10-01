import { phase9Step3Verify } from './phase-9-step-3-verify';
import { db } from '../../lib/db';

const TEST_SOLUTION_ID = '00000000-0000-0000-0000-000000000901';
const TEST_LEAD_ID = '00000000-0000-0000-0000-000000000911';

async function cleanupTestData() {
    await db.workflow_versions.deleteMany({
        where: { solution_id: TEST_SOLUTION_ID }
    });

    await db.solution_architectures.deleteMany({
        where: { id: TEST_SOLUTION_ID }
    });

    await db.leads.deleteMany({
        where: { id: TEST_LEAD_ID }
    });
}

async function main() {
    try {
        console.log('?? Initializing Validation Verification Suite...');

        await cleanupTestData();

        const results = await phase9Step3Verify.runTests();

        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.length - passed;

        console.log('\n--- VERIFICATION SUMMARY ---');
        console.log(`Total Tests: ${results.length}`);
        console.log(`? Passed: ${passed}`);
        console.log(`? Failed: ${failed}`);

        if (failed > 0) {
            process.exitCode = 1;
        }
    } catch (e) {
        console.error('? Suite crashed:', e);
        process.exitCode = 1;
    } finally {
        try {
            await cleanupTestData();
            console.log('[VERIFY] Test data cleanup completed.');
        } catch (cleanupError) {
            console.error('[VERIFY] Test data cleanup failed:', cleanupError);
            process.exitCode = 1;
        }
    }
}

main();
