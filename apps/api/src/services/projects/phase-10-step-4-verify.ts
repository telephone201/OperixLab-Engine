/**
 * @file phase-10-step-4-verify.ts
 * @description Verification suite for Requirements Confirmation and Scope Management.
 */

import { scopeManager } from './scope-manager';
import { ScopeClassification, ConfirmationStatus, ScopeBaselineStatus, ChangeRequestStatus } from './scope-types';
import { db } from '../../lib/db';
import { humanApprovalService } from '../governance/approval-service';
import { ApprovalDecision } from '../governance/types';
import crypto from 'crypto';

export class Phase10Step4Verify {
    async runTests() {
        console.log('[VERIFY] Starting Phase 10 Step 4 Scope Management Verification...');
        const results = [];

        try {
            const projectId = crypto.randomUUID();
            const userId = crypto.randomUUID();
            const solArchId = crypto.randomUUID();
            const solVerId = crypto.randomUUID();
            const reqVerId = crypto.randomUUID();
            const planVerId = crypto.randomUUID();
        const req1Id = crypto.randomUUID();
        const req2Id = crypto.randomUUID();
        const req3Id = crypto.randomUUID();
            const contractId = crypto.randomUUID();

            await db.contracts.create({
                data: {
                    id: contractId,
                    commercial_model: 'FIXED_FEE',
                    payment_terms: 'TEST',
                    minimum_commitment: 1,
                    scope: 'Scope management verification fixture',
                    support_terms: 'TEST',
                    status: 'ACCEPTED',
                    created_at: new Date()
                }
            });
            await db.projects.create({
                data: {
                    id: projectId,
                    contract_id: contractId,
                    name: 'Scope Test Project',
                    status: 'READY_TO_START',
                    payment_status: 'VERIFIED'
                }
            });

            // --- TEST 1: Requirements Confirmation Flow ---
            const conf = await scopeManager.createConfirmation({
                projectId, solutionArchitectureId: solArchId, solutionVersionId: solVerId,
                requirementsVersionId: reqVerId, deliveryPlanVersionId: planVerId, userId
            });

            await scopeManager.snapshotRequirements(conf.confirmationId, userId, [
                { requirementId: req1Id, classification: ScopeClassification.INCLUDED, priority: 'HIGH' },
                { requirementId: req2Id, classification: ScopeClassification.OPTIONAL, priority: 'MEDIUM' }
            ]);

            const baseline = await scopeManager.confirmScope(conf.confirmationId, userId);
            if (baseline.status === ScopeBaselineStatus.CONFIRMED) {
                results.push({ test: 'Requirements Confirmation & Baseline', status: 'PASS' });
            } else {
                results.push({ test: 'Requirements Confirmation & Baseline', status: 'FAIL' });
            }

            // --- TEST 2: Unresolved Requirement Block ---
            const conf2 = await scopeManager.createConfirmation({
                projectId, solutionArchitectureId: solArchId, solutionVersionId: solVerId,
                requirementsVersionId: reqVerId, deliveryPlanVersionId: planVerId, userId
            });

            await scopeManager.snapshotRequirements(conf2.confirmationId, userId, [
                { requirementId: req3Id, classification: ScopeClassification.UNRESOLVED, priority: 'HIGH' }
            ]);

            try {
                await scopeManager.confirmScope(conf2.confirmationId, userId);
                results.push({ test: 'Unresolved Block', status: 'FAIL' });
            } catch (e: any) {
                if (e.message.includes('CONFIRMATION_BLOCKED')) {
                    results.push({ test: 'Unresolved Block', status: 'PASS' });
                } else {
                    results.push({ test: 'Unresolved Block', status: 'FAIL' });
                }
            }

            // --- TEST 3: Change Request Lifecycle ---
            const cr = await scopeManager.createChangeRequest({
                projectId, scopeBaselineId: baseline.scopeBaselineId, requestedBy: userId,
                title: 'Add New Feature', description: 'Client wants X', reason: 'Business growth',
                classification: 'SCOPE_ADDITION' as any
            });

            await scopeManager.performImpactAnalysis(cr.changeRequestId, userId, {
                analysisId: 'ana_1', changeRequestId: cr.changeRequestId,
                requirementsImpact: 'New requirement needed', scopeImpact: 'Adds 1 item',
                solutionImpact: 'Low', workflowImpact: 'Medium', deliveryPlanImpact: 'Adds 1 task',
                scheduleImpact: 'Low', commercialImpact: 'Medium', technicalImpact: 'Low',
                riskImpact: 'Low', affectedItems: ['req_1'], recommendation: 'Approve',
                confidence: 'High', analyzedAt: new Date(), analyzedBy: userId
            });

            const approvalId = await scopeManager.requestChangeRequestApproval(
                cr.changeRequestId,
                userId
            );

            await humanApprovalService.submitDecision(
                approvalId,
                ApprovalDecision.APPROVED,
                userId,
                'Approved based on analysis'
            );

            await scopeManager.approveChangeRequest(
                cr.changeRequestId,
                userId,
                'Approved based on analysis'
            );

            const updatedCr = await db.change_requests.findUnique({ where: { id: cr.changeRequestId } });
            if (updatedCr?.status === ChangeRequestStatus.APPROVED) {
                results.push({ test: 'Change Request Governance', status: 'PASS' });
            } else {
                results.push({ test: 'Change Request Governance', status: 'FAIL' });
            }

        } catch (e) {
            console.error('[VERIFY] Suite failed:', e);
        }

        return results;
    }
}

export const phase10Step4Verify = new Phase10Step4Verify();

