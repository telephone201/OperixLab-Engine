/**
 * @file phase-8-pre-composition-verify.ts
 * @description Verification suite for Phase 8 Matching Logic.
 * Focuses on Hard Gates, Ranking, and Strategy decisions.
 */

import { HardGateEvaluator, GateStatus } from './hard-gate-evaluator';
import { WorkflowMatchRanker } from './workflow-match-ranker';
import { StrategyDecisionEngine, SolutionStrategy } from './strategy-decision-engine';

declare const jest: any;

export class Phase8PreCompositionSuite {
    private gateEvaluator = new HardGateEvaluator();
    private ranker = new WorkflowMatchRanker();
    private strategyEngine = new StrategyDecisionEngine(this.gateEvaluator, this.ranker);

    async runTests() {
        const results = [];

        // Test 1: High Score + Hard Gate Failure (Trigger)
        results.push(await this.testHighScoreHardGateFail());

        // Test 2: Moderate Score + All Gates Pass
        results.push(await this.testModerateScoreAllPass());

        // Test 3: MUST Requirement Missing
        results.push(await this.testMustRequirementMissing());

        // Test 4: License NOT_ELIGIBLE
        results.push(await this.testLicenseNotEligible());

        // Test 5: Security Blocker
        results.push(await this.testSecurityBlocker());

        // Test 6: No Single Match -> Compose
        results.push(await this.testNoSingleMatchCompose());

        // Test 7: No Composition -> BUILD
        results.push(await this.testNoCompositionBuild());

        return results;
    }

    private async testHighScoreHardGateFail() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'Super-Match', quality_score: 95 }];
        const requirements = [{ id: 'r1', priority: 'MUST', covered: true, trigger_definition: 'Webhook' }];

        // Mock the evaluator to fail the trigger gate
        const evalSpy = jest.spyOn(this.gateEvaluator, 'evaluate').mockResolvedValue({
            isEligible: false,
            results: [{ gateName: 'TRIGGER_COMPATIBILITY', status: GateStatus.FAIL, passed: false, evidence: 'Wrong trigger', reason: 'Incompatible', workflowId: 'wf1', timestamp: new Date() }]
        });

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);

        evalSpy.mockRestore();
        if (decision.strategy === SolutionStrategy.REUSE) throw new Error('High score should not override trigger failure');
        return { test: 'High Score / Hard Gate Fail', status: 'PASS' };
    }

    private async testModerateScoreAllPass() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'Mid-Match', quality_score: 70 }];
        const requirements = [{ id: 'r1', priority: 'MUST', covered: true }];

        const evalSpy = jest.spyOn(this.gateEvaluator, 'evaluate').mockResolvedValue({
            isEligible: true,
            results: []
        });

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);

        evalSpy.mockRestore();
        if (decision.strategy !== SolutionStrategy.REUSE) throw new Error(`Expected REUSE, got ${decision.strategy}`);
        return { test: 'Moderate Score / All Pass', status: 'PASS' };
    }

    private async testMustRequirementMissing() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'MissingMust', quality_score: 90 }];
        const requirements = [{ id: 'r1', priority: 'MUST', covered: false }];

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);
        if (decision.strategy === SolutionStrategy.REUSE) throw new Error('Missing MUST req should prevent REUSE');
        return { test: 'MUST Req Missing', status: 'PASS' };
    }

    private async testLicenseNotEligible() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'BadLicense', quality_score: 90 }];
        const requirements: any[] = [];

        const evalSpy = jest.spyOn(this.gateEvaluator, 'evaluate').mockResolvedValue({
            isEligible: false,
            results: [{ gateName: 'LICENSE', status: GateStatus.FAIL, passed: false, evidence: 'NOT_ELIGIBLE', reason: 'Licensing', workflowId: 'wf1', timestamp: new Date() }]
        });

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);

        evalSpy.mockRestore();
        if (decision.strategy === SolutionStrategy.REUSE) throw new Error('License NOT_ELIGIBLE should prevent selection');
        return { test: 'License Not Eligible', status: 'PASS' };
    }

    private async testSecurityBlocker() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'Unsafe', quality_score: 90 }];
        const requirements: any[] = [];

        const evalSpy = jest.spyOn(this.gateEvaluator, 'evaluate').mockResolvedValue({
            isEligible: false,
            results: [{ gateName: 'SECURITY', status: GateStatus.FAIL, passed: false, evidence: 'Critical risk', reason: 'Unsafe node', workflowId: 'wf1', timestamp: new Date() }]
        });

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);

        evalSpy.getMockImplementation();
        evalSpy.mockRestore();
        if (decision.strategy === SolutionStrategy.REUSE) throw new Error('Security blocker should prevent selection');
        return { test: 'Security Blocker', status: 'PASS' };
    }

    private async testNoSingleMatchCompose() {
        const candidates = [{ id: 'c1', workflow_id: 'wf1', name: 'Partial1', quality_score: 50 }];
        const requirements = [{ id: 'r1', priority: 'MUST', covered: false }];

        // Mock gates to allow CUSTOMIZE/COMPOSE but not REUSE
        const evalSpy = jest.spyOn(this.gateEvaluator, 'evaluate').mockResolvedValue({
            isEligible: true,
            results: []
        });

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);

        evalSpy.mockRestore();
        if (decision.strategy === SolutionStrategy.REUSE) throw new Error('Missing MUST should prevent REUSE');
        return { test: 'No Single Match -> Compose/Build', status: 'PASS' };
    }

    private async testNoCompositionBuild() {
        const candidates: any[] = []; // No candidates
        const requirements = [{ id: 'r1', priority: 'MUST', covered: false }];

        const decision = await this.strategyEngine.determineStrategy('lead1', candidates, requirements);
        if (decision.strategy !== SolutionStrategy.BUILD) throw new Error('No candidates should result in BUILD');
        return { test: 'No Composition -> BUILD', status: 'PASS' };
    }
}
