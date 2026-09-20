/**
 * @file deployment-service.ts
 * @description Orchestrates the safe deployment of workflow artifacts to n8n.
 */

import {
    DeploymentStatus,
    DeploymentEnvironment,
    DeploymentMode,
    DeploymentManifest,
    DeploymentErrorCode
} from './types';
import { n8nProvider } from './providers/n8n-provider';
import { deploymentSafetyPipeline } from './safety-pipeline';
import { deploymentVerifier } from './deployment-verifier';
import { activationGate } from './activation-gate';
import { db } from '../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';
import { artifactService } from '../versioning/artifact-service';

export class DeploymentService {
    /**
     * Executes the full deployment pipeline.
     */
    async deploy(
        versionId: string,
        environment: DeploymentEnvironment,
        userId: string,
        authorized: boolean = false,
        activationRequested: boolean = false
    ): Promise<{ deploymentId: string, status: DeploymentStatus, n8nWorkflowId?: string }> {

        console.log(`[DEPLOY] Initiating deployment for version ${versionId} to ${environment}...`);

        // 1. Safety Pipeline Evaluation
        const evaluation = await deploymentSafetyPipeline.evaluate(versionId, environment, authorized, userId);
        if (!evaluation.eligible) {
            const reason = evaluation.reason || 'UNKNOWN_ERROR';
            await auditLogger.log({
                action: 'DEPLOYMENT_BLOCKED',
                entityType: 'WorkflowVersion',
                entityId: versionId,
                details: { reason, environment }
            });
            throw new Error(`DEPLOYMENT_BLOCKED: ${reason}`);
        }

        const manifest = evaluation.manifest!;

        // 2. Create Deployment Record
        const deploymentId = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.workflow_deployments.create({
            data: {
                id: deploymentId,
                workflow_version_id: versionId,
                artifact_id: manifest.artifactId,
                artifact_hash: manifest.artifactHash,
                solution_id: manifest.solutionId,
                environment: environment,
                deployment_mode: manifest.deploymentMode,
                status: DeploymentStatus.DEPLOYING,
                requested_by: userId,
                started_at: new Date()
            }
        });

        // 3. Persist Manifest
        await db.deployment_manifests.create({
            data: {
                id: `man_${Date.now()}`,
                deployment_id: deploymentId,
                workflow_version_id: manifest.workflowVersionId,
                artifact_id: manifest.artifactId,
                artifact_hash: manifest.artifactHash,
                solution_id: manifest.solutionId,
                solution_version_id: manifest.solutionVersionId,
                origin_type: manifest.originType,
                environment: environment,
                requested_by: userId,
                requested_at: manifest.requestedAt,
                validation_id: manifest.validationId,
                validation_ruleset_version: manifest.validationRulesetVersion,
                existing_n8n_workflow_id: manifest.existingN8nWorkflowId,
                deployment_mode: manifest.deploymentMode,
                activation_requested: activationRequested
            }
        });

        await auditLogger.log({
            action: 'DEPLOYMENT_STARTED',
            entityType: 'WorkflowDeployment',
            entityId: deploymentId,
            details: { mode: manifest.deploymentMode, environment }
        });

        try {
            // 4. Snapshot (for UPDATE mode)
            let targetN8nId = manifest.existingN8nWorkflowId;
            if (manifest.deploymentMode === DeploymentMode.UPDATE && targetN8nId) {
                const currentWorkflow = await n8nProvider.getWorkflow(targetN8nId);
                const currentContent = JSON.stringify(currentWorkflow);

                await db.deployment_snapshots.create({
                    data: {
                        id: `snap_${Date.now()}`,
                        deployment_id: deploymentId,
                        n8n_workflow_id: targetN8nId,
                        environment: environment,
                        workflow_content_hash: require('crypto').createHash('sha256').update(currentContent).digest('hex'),
                        workflow_content: currentWorkflow,
                        captured_at: new Date()
                    }
                });
                await auditLogger.log({
                    action: 'DEPLOYMENT_SNAPSHOT_CREATED',
                    entityType: 'WorkflowDeployment',
                    entityId: deploymentId,
                    details: { n8n_id: targetN8nId }
                });
            }

            // 5. Execute Provider Call
            const artifactContent = await artifactService.getArtifactContent(manifest.artifactId);
            const workflowJson = JSON.parse(artifactContent.toString());

            const providerResult = manifest.deploymentMode === DeploymentMode.CREATE
                ? await n8nProvider.createWorkflow(`Operix_${versionId}`, workflowJson)
                : await n8nProvider.updateWorkflow(targetN8nId!, workflowJson);

            targetN8nId = providerResult.id;

            // 6. Bind Environment
            await db.workflow_environment_bindings.upsert({
                where: {
                    workflow_version_id_environment: {
                        workflow_version_id: versionId,
                        environment: environment
                    }
                },
                update: { n8n_workflow_id: targetN8nId },
                create: {
                    workflow_version_id: versionId,
                    environment: environment,
                    n8n_workflow_id: targetN8nId
                }
            });

            // 7. Verify Deployment
            const verification = await deploymentVerifier.verify(deploymentId, targetN8nId, manifest.artifactHash);
            await db.deployment_verifications.create({
                data: {
                    id: verification.verificationId,
                    deployment_id: deploymentId,
                    status: verification.status,
                    deployed_hash: verification.deployedHash,
                    expected_hash: verification.expectedHash,
                    verified_at: verification.verifiedAt
                }
            });

            const finalStatus = verification.status === 'VERIFIED'
                ? DeploymentStatus.VERIFIED
                : DeploymentStatus.DEPLOYMENT_FAILED;

            await db.workflow_deployments.update({
                where: { id: deploymentId },
                data: {
                    status: finalStatus,
                    n8n_workflow_id: targetN8nId,
                    completed_at: new Date()
                }
            });

            await auditLogger.log({
                action: finalStatus === DeploymentStatus.VERIFIED ? 'DEPLOYMENT_VERIFIED' : 'DEPLOYMENT_VERIFICATION_FAILED',
                entityType: 'WorkflowDeployment',
                entityId: deploymentId,
                details: { n8n_id: targetN8nId }
            });

            // 8. Activation Gate
            if (activationRequested && finalStatus === DeploymentStatus.VERIFIED) {
                const activationCheck = await activationGate.canActivate(deploymentId, true);
                if (activationCheck.canActivate) {
                    await n8nProvider.activateWorkflow(targetN8nId);
                    await db.workflow_deployments.update({
                        where: { id: deploymentId },
                        data: { status: DeploymentStatus.ACTIVE }
                    });

                    await db.activation_records.create({
                        data: {
                            id: `act_${Date.now()}`,
                            deployment_id: deploymentId,
                            n8n_workflow_id: targetN8nId,
                            action: 'ACTIVATE',
                            status: 'SUCCESS',
                            executed_at: new Date()
                        }
                    });

                    await auditLogger.log({
                        action: 'ACTIVATION_COMPLETED',
                        entityType: 'WorkflowDeployment',
                        entityId: deploymentId,
                        details: { n8n_id: targetN8nId }
                    });
                }
            }

            return {
                deploymentId,
                status: (await db.workflow_deployments.findUnique({ where: { id: deploymentId } }))?.status || DeploymentStatus.DEPLOYMENT_FAILED,
                n8nWorkflowId: targetN8nId
            };

        } catch (error: any) {
            const errorCode = error.message.startsWith('N8N_') ? error.message : 'DEPLOYMENT_FAILED';
            await db.workflow_deployments.update({
                where: { id: deploymentId },
                data: {
                    status: DeploymentStatus.DEPLOYMENT_FAILED,
                    error_code: errorCode,
                    error_message_safe: error.message,
                    completed_at: new Date()
                }
            });

            await auditLogger.log({
                action: 'DEPLOYMENT_FAILED',
                entityType: 'WorkflowDeployment',
                entityId: deploymentId,
                details: { error: errorCode }
            });

            throw error;
        }
    }

    /**
     * Explicitly activate a previously deployed and verified workflow.
     */
    async activate(deploymentId: string, userId: string, authorized: boolean): Promise<{ status: string }> {
        const check = await activationGate.canActivate(deploymentId, authorized);
        if (!check.canActivate) {
            throw new Error(`ACTIVATION_BLOCKED: ${check.reason}`);
        }

        const deployment = await db.workflow_deployments.findUnique({ where: { id: deploymentId } });
        if (!deployment || !deployment.n8n_workflow_id) throw new Error('N8N_WORKFLOW_NOT_FOUND');

        try {
            await n8nProvider.activateWorkflow(deployment.n8n_workflow_id);
            await db.workflow_deployments.update({
                where: { id: deploymentId },
                data: { status: DeploymentStatus.ACTIVE }
            });

            await db.activation_records.create({
                data: {
                    id: `act_${Date.now()}`,
                    deployment_id: deploymentId,
                    n8n_workflow_id: deployment.n8n_workflow_id,
                    action: 'ACTIVATE',
                    status: 'SUCCESS',
                    executed_at: new Date()
                }
            });

            await auditLogger.log({
                action: 'ACTIVATION_COMPLETED',
                entityType: 'WorkflowDeployment',
                entityId: deploymentId,
                details: { n8n_id: deployment.n8n_workflow_id }
            });

            return { status: 'ACTIVE' };
        } catch (error: any) {
            await db.activation_records.create({
                data: {
                    id: `act_${Date.now()}`,
                    deployment_id: deploymentId,
                    n8n_workflow_id: deployment.n8n_workflow_id,
                    action: 'ACTIVATE',
                    status: 'FAILED',
                    error_message_safe: error.message,
                    executed_at: new Date()
                }
            });
            throw error;
        }
    }
}

export const deploymentService = new DeploymentService();
