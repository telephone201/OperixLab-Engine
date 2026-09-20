/**
 * @file phase-10-step-7-verify.ts
 * @description Verification suite for Project Completion and Closure Governance.
 */

import { completionService } from './completion-service';
import { completionEligibilityGate } from './completion-eligibility-gate';
import { CompletionStatus, CompletionDecision, CompletionReviewStatus } from './completion-types';
import { db } from '../lib/db';
import { ProjectStatus, PaymentStatus } from './types';

export class Phase10Step7Verify {
    async runTests() {
        console.log('[VERIFY] Starting Phase 10 Step 7 Project Completion Verification...');
        const results = [];

        try {
            const projectId = 'proj_comp_test_123';
            const userId = 'user_admin_123';
            const acceptanceId = 'acc_123';
            const handoverId = 'ho_123';
            const supportId = 'st_123';

            // --- TEST 1: Blocked if not HANDED_OVER ---
            await db.projects.create({
                data: {
                    id: projectId,
                    contract_id: 'cont_123',
                    name: 'Completion Test Project',
                    status: 'ACCEPTED',
                    payment_status: PaymentStatus.VERIFIED
                }
            });

            const eligibility1 = await completionEligibilityGate.evaluate(projectId);
            if (!eligibility1.ready && eligibility1.blockingReasons.includes('PROJECT_NOT_HANDED_OVER')) {
                results.push({ test: 'Block Non-Handed Over', status: 'PASS' });
            } else {
                results.push({ test: 'Block Non-Handed Over', status: 'FAIL' });
            }

            // --- TEST 2: Valid Completion Flow ---
            await db.projects.update({ where: { id: projectId }, data: { status: 'HANDED_OVER' } });

            // Setup required evidence
            await db.acceptance_records.create({
                data: {
                    id: acceptanceId, project_id: projectId,
                    decision: 'ACCEPTED', decided_by: userId, decided_at: new Date(),
                    reason: 'Looks good', scope_hash: 'h1', review_hash: 'h2', created_at: new Date()
                }
            });
            await db.handovers.create({
                data: {
                    id: handoverId, project_id: projectId,
                    status: 'HANDED_OVER', completed_at: new Date(),
                    acceptance_id: acceptanceId, scope_baseline_id: 'base_123',
                    delivery_plan_version_id: 'plan_123', solution_version_id: 'sol_123',
                    workflow_version_id: 'wf_123', created_by: userId, created_at: new Date(), updated_at: new Date()
                }
            });
            await db.support_transitions.create({
                data: {
                    id: supportId, project_id: projectId, handover_id: handoverId,
                    status: 'COMPLETED', transitioned_by: userId, transitioned_at: new Date()
                }
            });
            // Mock a delivery plan with all tasks complete
            await db.delivery_plans.create({
                data: {
                    id: 'plan_123', projectId: projectId,
                    status: 'ACTIVE', planningRulesVersion: 'v1.0',
                    createdBy: userId, createdAt: new Date(), updatedAt: new Date()
                }
            });

            const eligibility2 = await completionEligibilityGate.evaluate(projectId);
            if (eligibility2.ready) {
                results.push({ test: 'Completion Eligibility PASS', status: 'PASS' });
            } else {
                results.push({ test: 'Completion Eligibility PASS', status: 'FAIL' });
            }

            // --- TEST 3: Finalization and Lifecycle Transition ---
            const readiness = await completionService.evaluateCompletionReadiness(projectId, userId);
            const review = await completionService.startCompletionReview(projectId, readiness.completionReadinessId, userId);

            // Manually approve review for test
            await db.completion_reviews.update({
                where: { id: review.completionReviewId },
                data: { decision: CompletionDecision.APPROVED, status: CompletionReviewStatus.APPROVED }
            });

            const closure = await completionService.finalizeCompletion(review.completionReviewId, userId);

            const finalProject = await db.projects.findUnique({ where: { id: projectId } });
            if (finalProject?.status === ProjectStatus.COMPLETED) {
                results.push({ test: 'Project Lifecycle Transition', status: 'PASS' });
            } else {
                results.push({ test: 'Project Lifecycle Transition', status: 'FAIL' });
            }

            const snapshot = await db.project_closure_snapshots.findUnique({ where: { id: closure.snapshotId } });
            if (snapshot) {
                results.push({ test: 'Closure Snapshot Created', status: 'PASS' });
            } else {
                results.push({ test: 'Closure Snapshot Created', status: 'FAIL' });
            }

        } catch (e) {
            console.error('[VERIFY] Suite failed:', e);
        }

        return results;
    }
}

export const phase10Step7Verify = new Phase10Step7Verify();
