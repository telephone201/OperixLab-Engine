/**
 * @file phase-10-step-6-verify.ts
 * @description Verification suite for Handover and Support Transition.
 */

import { handoverService } from './handover-service';
import { HandoverStatus, HandoverItemStatus, SupportReadinessStatus, SupportTransitionStatus } from './handover-types';
import { db } from '../../lib/db';
import { ProjectStatus, PaymentStatus } from './types';

export class Phase10Step6Verify {
    async runTests() {
        console.log('[VERIFY] Starting Phase 10 Step 6 Handover Verification...');
        const results = [];

        try {
            const projectId = 'proj_ho_test_123';
            const userId = 'user_admin_123';
            const acceptanceId = 'acc_123';
            const scopeBaselineId = 'base_123';
            const planVerId = 'plan_ver_123';
            const solVerId = 'sol_ver_123';
            const wfVerId = 'wf_ver_123';

            // Setup Project in ACCEPTED state
            await db.projects.create({
                data: {
                    id: projectId,
                    contract_id: 'cont_123',
                    name: 'Handover Test Project',
                    status: 'ACCEPTED',
                    payment_status: PaymentStatus.VERIFIED
                }
            });

            // --- TEST 1: Handover Initiation ---
            const handover = await handoverService.initiateHandover({
                projectId, acceptanceId, scopeBaselineId, deliveryPlanVersionId: planVerId,
                solutionVersionId: solVerId, workflowVersionId: wfVerId, userId
            });
            if (handover.status === HandoverStatus.DRAFT) {
                results.push({ test: 'Handover Initiation', status: 'PASS' });
            } else {
                results.push({ test: 'Handover Initiation', status: 'FAIL' });
            }

            // --- TEST 2: Checklist Generation & Completion ---
            const items = await handoverService.generateHandoverChecklist(handover.handoverId);
            if (items.length > 0) {
                await handoverService.completeHandoverItem(items[0].handoverItemId, userId, 'Evidence A');
                results.push({ test: 'Checklist Completion', status: 'PASS' });
            } else {
                results.push({ test: 'Checklist Completion', status: 'FAIL' });
            }

            // --- TEST 3: Approval Gate (Block if incomplete) ---
            try {
                await handoverService.approveHandover(handover.handoverId, userId);
                results.push({ test: 'Approval Gate (Block)', status: 'FAIL' });
            } catch (e: any) {
                if (e.message.includes('HANDOVER_BLOCKED')) {
                    results.push({ test: 'Approval Gate (Block)', status: 'PASS' });
                } else {
                    results.push({ test: 'Approval Gate (Block)', status: 'FAIL' });
                }
            }

            // --- TEST 4: Successful Handover & Lifecycle Transition ---
            // Complete all items
            for (const item of items) {
                await handoverService.completeHandoverItem(item.handoverItemId, userId, 'Evidence');
            }
            await handoverService.approveHandover(handover.handoverId, userId);

            const updatedProject = await db.projects.findUnique({ where: { id: projectId } });
            if (updatedProject?.status === 'HANDED_OVER') {
                results.push({ test: 'Handover Project Transition', status: 'PASS' });
            } else {
                results.push({ test: 'Handover Project Transition', status: 'FAIL' });
            }

            // --- TEST 5: Support Readiness & Activation ---
            const sr = await handoverService.establishSupportReadiness({
                projectId, handoverId: handover.handoverId,
                supportMode: 'CONTRACTED' as any,
                supportReference: 'SUP-123',
                knownLimitations: 'None',
                operationalRequirements: 'Standard',
                escalationReference: 'Escalation Team',
                userId
            });

            await handoverService.activateSupport({
                projectId, handoverId: handover.handoverId,
                supportReadinessId: sr.supportReadinessId, userId
            });

            const transition = await db.support_transitions.findFirst({ where: { project_id: projectId } });
            if (transition?.status === SupportTransitionStatus.COMPLETED) {
                results.push({ test: 'Support Activation', status: 'PASS' });
            } else {
                results.push({ test: 'Support Activation', status: 'FAIL' });
            }

        } catch (e) {
            console.error('[VERIFY] Suite failed:', e);
        }

        return results;
    }
}

export const phase10Step6Verify = new Phase10Step6Verify();

