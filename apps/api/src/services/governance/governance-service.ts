/**
 * @file governance-service.ts
 * @description High-level orchestrator for the Governance layer.
 */

import { db } from '../lib/db';
import {
    ApprovalType,
    ApprovalDecision,
    GovernanceState,
    DeploymentEnvironment
} from './types';
import { humanApprovalService } from './approval-service';
import { approvalGate } from './approval-gate';
import { knownGoodVersionManager } from './known-good-manager';
import { rollbackSafetyGate } from './rollback-safety-gate';
import { rollbackExecutor } from './rollback-executor';
import { rollbackVerifier } from './rollback-verifier';
import { deploymentService } from '../deployment/deployment-service';
import { auditLogger } from '../../core/logging/audit-logger';

export class GovernanceService {
    /**
     * Requests approval for a deployment.
     */
    async requestDeploymentApproval(params: {
        workflowVersionId: string;
        environment: DeploymentEnvironment;
        userId: string;
        artifactHash: string;
    }): Promise<string> {
        // Prerequisites: Validation must be PASSED
        const validation = await db.workflow_validations.findFirst({
            where: {
                workflow_version_id: params.workflowVersionId,
                status: 'PASSED'
            },
            orderBy: { created_at: 'desc' }
        });

        if (!validation) {
            throw new Error('DEPLOYMENT_APPROVAL_BLOCKED: Workflow must have a PASSED validation status.');
        }

        return await humanApprovalService.requestApproval({
            entityId: params.workflowVersionId,
            entityType: 'WorkflowVersion',
            approvalType: ApprovalType.DEPLOYMENT,
            requestedBy: params.userId,
            workflowVersionId: params.workflowVersionId,
            artifactHash: params.artifactHash,
            environment: params.environment
        });
    }

    /**
     * Authorizes and executes deployment if approved.
     */
    async authorizeDeployment(params: {
        workflowVersionId: string;
        environment: DeploymentEnvironment;
        userId: string;
        artifactHash: string;
    }): Promise<{ deploymentId: string, status: string }> {

        const auth = await approvalGate.isAuthorized(params.workflowVersionId, ApprovalType.DEPLOYMENT, {
            workflowVersionId: params.workflowVersionId,
            artifactHash: params.artifactHash,
            environment: params.environment
        });

        if (!auth.authorized) {
            throw new Error(`DEPLOYMENT_NOT_AUTHORIZED: ${auth.reason}`);
        }

        const result = await deploymentService.deploy(
            params.workflowVersionId,
            params.environment,
            params.userId,
            true, // authorized
            false // activationRequested
        );

        return result;
    }

    /**
     * Requests approval for activation.
     */
    async requestActivationApproval(params: {
        deploymentId: string;
        userId: string;
        environment: DeploymentEnvironment;
    }): Promise<string> {
        const deployment = await db.workflow_deployments.findUnique({ where: { id: params.deploymentId } });
        if (!deployment || deployment.status !== 'VERIFIED') {
            throw new Error('ACTIVATION_APPROVAL_BLOCKED: Deployment must be VERIFIED before requesting activation.');
        }

        return await humanApprovalService.requestApproval({
            entityId: params.deploymentId,
            entityType: 'WorkflowDeployment',
            approvalType: ApprovalType.ACTIVATION,
            requestedBy: params.userId,
            environment: params.environment
        });
    }

    /**
     * Authorizes and executes activation.
     */
    async authorizeActivation(params: {
        deploymentId: string;
        userId: string;
        environment: DeploymentEnvironment;
    }): Promise<{ status: string }> {
        const auth = await approvalGate.isAuthorized(params.deploymentId, ApprovalType.ACTIVATION, {
            deploymentId: params.deploymentId,
            environment: params.environment
        });

        if (!auth.authorized) {
            throw new Error(`ACTIVATION_NOT_AUTHORIZED: ${auth.reason}`);
        }

        return await deploymentService.activate(params.deploymentId, params.userId, true);
    }

    /**
     * Marks a workflow as Known-Good.
     */
    async markKnownGood(params: {
        workflowVersionId: string;
        environment: DeploymentEnvironment;
        deploymentId: string;
        n8nWorkflowId: string;
        artifactHash: string;
        userId: string;
        reason: string;
    }): Promise<string> {
        // Verification: Must be ACTIVE and VERIFIED
        const deployment = await db.workflow_deployments.findUnique({ where: { id: params.deploymentId } });
        if (!deployment || deployment.status !== 'ACTIVE') {
            throw new Error('KNOWN_GOOD_BLOCKED: Workflow must be ACTIVE to be marked as Known-Good.');
        }

        return await knownGoodVersionManager.certifyVersion(params);
    }

    /**
     * Requests a rollback to a known-good version.
     */
    async requestRollback(params: {
        currentDeploymentId: string;
        environment: DeploymentEnvironment;
        userId: string;
        incidentId: string;
        reasonCode: string;
    }): Promise<{ rollbackId: string, targetVersionId: string }> {

        // 1. Identify latest Known-Good
        const target = await knownGoodVersionManager.getLatestKnownGood(params.environment);
        if (!target) throw new Error('ROLLBACK_BLOCKED: No Known-Good version available for this environment.');

        // 2. Eligibility Check
        const eligibility = await rollbackSafetyGate.checkEligibility(target, params.environment);
        if (!eligibility.eligible) {
            throw new Error(`ROLLBACK_BLOCKED: ${eligibility.reason}`);
        }

        // 3. Create Rollback Operation Record
        const rollbackId = `rb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.rollback_operations.create({
            data: {
                id: rollbackId,
                current_deployment_id: params.currentDeploymentId,
                target_workflow_version_id: target.workflowVersionId,
                target_deployment_id: target.deploymentId,
                environment: params.environment,
                n8n_workflow_id: target.n8nWorkflowId,
                incident_id: params.incidentId,
                reason_code: params.reasonCode,
                status: 'PENDING',
                requested_by: params.userId,
                requested_at: new Date()
            }
        });

        // 4. Request Approval
        await humanApprovalService.requestApproval({
            entityId: rollbackId,
            entityType: 'RollbackOperation',
            approvalType: ApprovalType.ROLLBACK,
            requestedBy: params.userId
        });

        return { rollbackId, targetVersionId: target.workflowVersionId };
    }

    /**
     * Authorizes and executes a rollback.
     */
    async executeRollback(params: {
        rollbackId: string;
        userId: string;
    }): Promise<{ success: boolean, status: string }> {

        // 1. Authorization Check
        const auth = await approvalGate.isAuthorized(params.rollbackId, ApprovalType.ROLLBACK, {});
        if (!auth.authorized) {
            throw new Error(`ROLLBACK_NOT_AUTHORIZED: ${auth.reason}`);
        }

        const rb = await db.rollback_operations.findUnique({ where: { id: params.rollbackId } });
        if (!rb) throw new Error('ROLLBACK_NOT_FOUND');

        // 2. Execute
        await db.rollback_operations.update({
            where: { id: params.rollbackId },
            data: { status: 'EXECUTING', approved_by: params.userId, approved_at: new Date() }
        });

        try {
            const result = await rollbackExecutor.executeRollback({
                rollbackId: params.rollbackId,
                target: {
                    knownGoodId: '', // not needed by executor
                    workflowVersionId: rb.target_workflow_version_id,
                    artifactHash: '', // resolved internally
                    environment: rb.environment,
                    deploymentId: rb.target_deployment_id,
                    n8nWorkflowId: rb.n8n_workflow_id,
                    markedAt: new Date(),
                    markedBy: '',
                    reason: ''
                } as any,
                currentN8nWorkflowId: rb.n8n_workflow_id,
                environment: rb.environment
            });

            // 3. Verify
            const verification = await rollbackVerifier.verifyRollback({
                rollbackId: params.rollbackId,
                targetVersionId: rb.target_workflow_version_id,
                targetArtifactHash: '', // resolve from db
                n8nWorkflowId: rb.n8n_workflow_id,
                environment: rb.environment
            });

            if (!verification.verified) {
                await db.rollback_operations.update({
                    where: { id: params.rollbackId },
                    data: { status: 'FAILED', error_code: 'VERIFICATION_FAILED' }
                });
                throw new Error(`ROLLBACK_VERIFICATION_FAILED: ${verification.reason}`);
            }

            await db.rollback_operations.update({
                where: { id: params.rollbackId },
                data: { status: 'VERIFIED', completed_at: new Date() }
            });

            return { success: true, status: 'VERIFIED' };
        } catch (error: any) {
            await db.rollback_operations.update({
                where: { id: params.rollbackId },
                data: { status: 'FAILED', error_code: 'EXECUTION_FAILED', safe_error_message: error.message }
            });
            throw error;
        }
    }
}

export const governanceService = new GovernanceService();
