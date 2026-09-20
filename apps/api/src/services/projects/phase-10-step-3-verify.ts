/**
 * @file phase-10-step-3-verify.ts
 * @description Verification suite for the Delivery Planning Engine.
 */

import { deliveryPlanService } from './delivery-plan-service';
import { deliveryPlanner } from './delivery-planner';
import { ProjectStatus, PaymentStatus } from './types';
import { db } from '../../lib/db';
import { OriginType } from '../versioning/version-service';

export class Phase10Step3Verify {
    async runTests() {
        console.log('[VERIFY] Starting Phase 10 Step 3 Delivery Planning Verification...');
        const results = [];

        try {
            // Setup test data
            const projectId = 'proj_test_plan_123';
            const solArchId = 'sol_arch_123';
            const solVerId = 'sol_ver_123';
            const wfVerId = 'wf_ver_123';
            const userId = 'user_admin_123';

            await db.projects.create({
                data: {
                    id: projectId,
                    contract_id: 'cont_123',
                    name: 'Test Project',
                    status: 'READY_TO_START',
                    payment_status: PaymentStatus.VERIFIED
                }
            });

            // --- TEST 1: Determinism ---
            const plan1 = deliveryPlanner.generatePlanComponents({
                projectId, solutionArchitectureId: solArchId,
                solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
            }, OriginType.REUSED);

            const plan2 = deliveryPlanner.generatePlanComponents({
                projectId, solutionArchitectureId: solArchId,
                solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
            }, OriginType.REUSED);

            if (plan1.milestones.length === plan2.milestones.length &&
                plan1.tasks.length === plan2.tasks.length) {
                results.push({ test: 'Plan Determinism', status: 'PASS' });
            } else {
                results.push({ test: 'Plan Determinism', status: 'FAIL' });
            }

            // --- TEST 2: Strategy Awareness (REUSE vs BUILD) ---
            const reusePlan = deliveryPlanner.generatePlanComponents({
                projectId, solutionArchitectureId: solArchId,
                solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
            }, OriginType.REUSED);

            const buildPlan = deliveryPlanner.generatePlanComponents({
                projectId, solutionArchitectureId: solArchId,
                solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
            }, OriginType.CUSTOM_BUILT);

            if (buildPlan.tasks.length > reusePlan.tasks.length) {
                results.push({ test: 'Strategy Awareness (Build > Reuse)', status: 'PASS' });
            } else {
                results.push({ test: 'Strategy Awareness (Build > Reuse)', status: 'FAIL' });
            }

            // --- TEST 3: Dependency Integrity ---
            const hasCircular = this.detectCircularDependencies(plan1.taskDependencies);
            if (!hasCircular) {
                results.push({ test: 'No Circular Dependencies', status: 'PASS' });
            } else {
                results.push({ test: 'No Circular Dependencies', status: 'FAIL' });
            }

            // --- TEST 4: Eligibility Gating ---
            // Set payment to REQUIRED
            await db.projects.update({
                where: { id: projectId },
                data: { payment_status: 'REQUIRED' }
            });

            try {
                await deliveryPlanService.generatePlan({
                    projectId, solutionArchitectureId: solArchId,
                    solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
                });
                results.push({ test: 'Eligibility Gating', status: 'FAIL' });
            } catch (e: any) {
                if (e.message.includes('PLAN_GENERATION_BLOCKED')) {
                    results.push({ test: 'Eligibility Gating', status: 'PASS' });
                } else {
                    results.push({ test: 'Eligibility Gating', status: 'FAIL' });
                }
            }

        } catch (e) {
            console.error('[VERIFY] Suite failed:', e);
        }

        return results;
    }

    private detectCircularDependencies(deps: { taskId: string, dependsOnTaskId: string }[]): boolean {
        const adj = new Map<string, string[]>();
        for (const d of deps) {
            if (!adj.has(d.taskId)) adj.set(d.taskId, []);
            adj.get(d.taskId)!.push(d.dependsOnTaskId);
        }

        const visited = new Set<string>();
        const recStack = new Set<string>();

        const isCyclic = (v: string): boolean => {
            if (!visited.has(v)) {
                visited.add(v);
                recStack.add(v);
                const neighbors = adj.get(v) || [];
                for (const n of neighbors) {
                    if (!visited.has(n) && isCyclic(n)) return true;
                    if (recStack.has(n)) return true;
                }
            }
            recStack.delete(v);
            return false;
        };

        for (const node of adj.keys()) {
            if (isCyclic(node)) return true;
        }
        return false;
    }
}

export const phase10Step3Verify = new Phase10Step3Verify();

