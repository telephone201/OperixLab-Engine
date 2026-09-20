import { phase9Step3Verify } from './phase-9-step-3-verify';
import { db } from '../lib/db';

async function main() {
    try {
        console.log('🚀 Initializing Validation Verification Suite...');
        
        // Ensure we have a clean state for test IDs
        await db.workflow_versions.deleteMany({ where: { solutionId: 'sol_test_verify' } });
        
        const results = await phase9Step3Verify.runTests();
        
        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.length - passed;
        
        console.log('\n--- VERIFICATION SUMMARY ---');
        console.log(`Total Tests: ${results.length}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        
        if (failed > 0) {
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Suite crashed:', e);
        process.exit(1);
    }
}

main();