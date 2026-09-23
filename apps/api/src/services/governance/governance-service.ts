/**
 * @file governance-service.ts
 * @description Coordinates deployment approval, authorization and known-good certification.
 */

import crypto from 'crypto';
import { db } from '../../lib/db';
import { approvalGate } from './approval-gate';
import { humanApprovalService } from './approval-service';
import { knownGoodVersionManager } from './known-good-manager';
import { rollbackSafetyGate } from './rollback-safety-gate';
import { rollbackExecutor } from './rollback-executor';
import { rollbackVerifier } from './rollback-verifier';
import { deploymentService } from '../deployment/deployment-service';
import {
    ApprovalType,
    ApprovalDecision,
    GovernanceState
} from './types';
import {
    DeploymentEnvironment,
    DeploymentMode,
    DeploymentStatus
} from '../deployment/types';

export interface DeploymentApprovalRequest {
    workflowVersionId: string;
    environment: DeploymentEnvironment;
    userId: string;
    artifactHash: string;
}

export interface DeploymentAuthorizationRequest {
    workflowVersionId: string;
    environment: DeploymentEnvironment;
    userId: string;
    artifactHash: string;
}

export interface KnownGoodRequest {
    workflowVersionId: string;
    environment: DeploymentEnvironment;
    deploymentId: string;
    n8nWorkflowId: string;
    artifactHash: string;
    userId: string;
    reason: string;
}

export class GovernanceService {

    async requestDeploymentApproval(
        params: DeploymentApprovalRequest
    ): Promise<string> {

        const version = await db.workflow_versions.findUnique({
            where: { id: params.workflowVersionId }
        });

        if (!version) {
            throw new Error('WORKFLOW_VERSION_NOT_FOUND');
        }

        if (version.content_hash !== params.artifactHash) {
            throw new Error('ARTIFACT_HASH_MISMATCH');
        }

        return humanApprovalService.requestApproval({
            entityId: params.workflowVersionId,
            entityType: 'WORKFLOW_VERSION',
            approvalType: ApprovalType.DEPLOYMENT,
            requestedBy: params.userId,
            workflowVersionId: params.workflowVersionId,
            artifactHash: params.artifactHash,
            environment: params.environment
        });
    }

    async authorizeDeployment(
        params: DeploymentAuthorizationRequest
    ): Promise<{ deploymentId: string }> {

        const version = await db.workflow_versions.findUnique({
            where: { id: params.workflowVersionId }
        });

        if (!version) {
            throw new Error('WORKFLOW_VERSION_NOT_FOUND');
        }

        if (version.content_hash !== params.artifactHash) {
            throw new Error('ARTIFACT_HASH_MISMATCH');
        }

        const authorization = await approvalGate.isAuthorized(
            params.workflowVersionId,
            ApprovalType.DEPLOYMENT,
            {
                workflowVersionId: params.workflowVersionId,
                artifactHash: params.artifactHash,
                environment: params.environment
            }
        );

        if (!authorization.authorized) {
            throw new Error(
                authorization.reason || 'DEPLOYMENT_NOT_AUTHORIZED'
            );
        }

        const existing = await db.workflow_deployments.findFirst({
            where: {
                workflow_version_id: params.workflowVersionId,
                environment: params.environment
            }
        });

        if (existing) {
            return { deploymentId: existing.id };
        }

        const deploymentId = crypto.randomUUID();

        const inserted = await db.query(
            `
            INSERT INTO workflow_deployments (
                id,
                workflow_version_id,
                artifact_id,
                artifact_hash,
                solution_id,
                environment,
                deployment_mode,
                status,
                requested_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (workflow_version_id, environment) DO NOTHING
            RETURNING id
            `,
            [
                deploymentId,
                params.workflowVersionId,
                version.artifact_id,
                params.artifactHash,
                version.solution_id,
                params.environment,
                DeploymentMode.CREATE,
                DeploymentStatus.AUTHORIZED,
                params.userId
            ]
        );

        if (inserted.rows.length > 0) {
            return { deploymentId: inserted.rows[0].id };
        }

        const concurrentDeployment = await db.workflow_deployments.findFirst({
            where: {
                workflow_version_id: params.workflowVersionId,
                environment: params.environment
            }
        });

        if (!concurrentDeployment) {
            throw new Error('DEPLOYMENT_CREATE_CONFLICT');
        }

        return { deploymentId: concurrentDeployment.id };
    }

    /**
     * Requests approval for activation.
     */
    async requestActivationApproval(params: {
        deploymentId: string;
        userId: string;
        environment: DeploymentEnvironment;
    }): Promise<string> {
        const deployment = await db.workflow_deployments.findUnique({
            where: { id: params.deploymentId }
        });

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
        const auth = await approvalGate.isAuthorized(
            params.deploymentId,
            ApprovalType.ACTIVATION,
            {
                deploymentId: params.deploymentId,
                environment: params.environment
            }
        );

        if (!auth.authorized) {
            throw new Error(`ACTIVATION_NOT_AUTHORIZED: ${auth.reason}`);
        }

        return await deploymentService.activate(
            params.deploymentId,
            params.userId,
            true
        );
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
    }): Promise<{ rollbackId: string; targetVersionId: string }> {
        const target = await knownGoodVersionManager.getLatestKnownGood(
            params.environment
        );

        if (!target) {
            throw new Error(
                'ROLLBACK_BLOCKED: No Known-Good version available for this environment.'
            );
        }

        const eligibility = await rollbackSafetyGate.checkEligibility(
            target,
            params.environment
        );

        if (!eligibility.eligible) {
            throw new Error(`ROLLBACK_BLOCKED: ${eligibility.reason}`);
        }

        const rollbackId =
            `rb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

        await humanApprovalService.requestApproval({
            entityId: rollbackId,
            entityType: 'RollbackOperation',
            approvalType: ApprovalType.ROLLBACK,
            requestedBy: params.userId
        });

        return {
            rollbackId,
            targetVersionId: target.workflowVersionId
        };
    }

    /**
     * Authorizes and executes a rollback.
     */
    async executeRollback(params: {
        rollbackId: string;
        userId: string;
    }): Promise<{ success: boolean; status: string }> {
        const auth = await approvalGate.isAuthorized(
            params.rollbackId,
            ApprovalType.ROLLBACK,
            {}
        );

        if (!auth.authorized) {
            throw new Error(`ROLLBACK_NOT_AUTHORIZED: ${auth.reason}`);
        }

        const rb = await db.rollback_operations.findUnique({
            where: { id: params.rollbackId }
        });

        if (!rb) {
            throw new Error('ROLLBACK_NOT_FOUND');
        }

        await db.rollback_operations.update({
            where: { id: params.rollbackId },
            data: {
                status: 'EXECUTING',
                approved_by: params.userId,
                approved_at: new Date()
            }
        });

        try {
            await rollbackExecutor.executeRollback({
                rollbackId: params.rollbackId,
                target: {
                    knownGoodId: '',
                    workflowVersionId: rb.target_workflow_version_id,
                    artifactHash: '',
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

            const verification = await rollbackVerifier.verifyRollback({
                rollbackId: params.rollbackId,
                targetVersionId: rb.target_workflow_version_id,
                targetArtifactHash: '',
                n8nWorkflowId: rb.n8n_workflow_id,
                environment: rb.environment
            });

            if (!verification.verified) {
                await db.rollback_operations.update({
                    where: { id: params.rollbackId },
                    data: {
                        status: 'FAILED',
                        error_code: 'VERIFICATION_FAILED'
                    }
                });

                throw new Error(
                    `ROLLBACK_VERIFICATION_FAILED: ${verification.reason}`
                );
            }

            await db.rollback_operations.update({
                where: { id: params.rollbackId },
                data: {
                    status: 'VERIFIED',
                    completed_at: new Date()
                }
            });

            return {
                success: true,
                status: 'VERIFIED'
            };
        } catch (error: any) {
            await db.rollback_operations.update({
                where: { id: params.rollbackId },
                data: {
                    status: 'FAILED',
                    error_code: 'EXECUTION_FAILED',
                    safe_error_message: error.message
                }
            });

            throw error;
        }
    }
    async markKnownGood(
        params: KnownGoodRequest
    ): Promise<string> {

        const deployment = await db.workflow_deployments.findUnique({
            where: { id: params.deploymentId }
        });

        if (!deployment) {
            throw new Error('DEPLOYMENT_NOT_FOUND');
        }

        if (deployment.workflow_version_id !== params.workflowVersionId) {
            throw new Error('WORKFLOW_VERSION_MISMATCH');
        }

        if (deployment.environment !== params.environment) {
            throw new Error('ENVIRONMENT_MISMATCH');
        }

        if (deployment.artifact_hash !== params.artifactHash) {
            throw new Error('ARTIFACT_HASH_MISMATCH');
        }

        if (
            deployment.status !== DeploymentStatus.ACTIVE &&
            deployment.status !== DeploymentStatus.VERIFIED
        ) {
            throw new Error(
                `DEPLOYMENT_NOT_READY_FOR_KNOWN_GOOD: ${deployment.status}`
            );
        }

        return knownGoodVersionManager.certifyVersion({
            workflowVersionId: params.workflowVersionId,
            environment: params.environment,
            deploymentId: params.deploymentId,
            n8nWorkflowId: params.n8nWorkflowId,
            artifactHash: params.artifactHash,
            userId: params.userId,
            reason: params.reason
        });
    }
}

export const governanceService = new GovernanceService();
