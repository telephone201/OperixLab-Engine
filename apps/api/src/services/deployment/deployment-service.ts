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
import { IDeploymentProvider } from './providers/deployment-provider.interface';
import { deploymentSafetyPipeline } from './safety-pipeline';
import { DeploymentVerifier, deploymentVerifier } from './deployment-verifier';
import { activationGate } from './activation-gate';
import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';
import { artifactService } from '../versioning/artifact-service';
import crypto from 'crypto';

export class DeploymentService {
    constructor(private readonly provider: IDeploymentProvider = n8nProvider, private readonly verifier: DeploymentVerifier = deploymentVerifier) {}
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

        // 2. Create Deployment Record atomically.
        // The unique (workflow_version_id, environment) index is the concurrency guard.
        const deploymentId = crypto.randomUUID();
        const insertedDeployment = await db.query(
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
                requested_by,
                started_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (workflow_version_id, environment)
            DO NOTHING
            RETURNING id, status, n8n_workflow_id
            `,
            [
                deploymentId,
                versionId,
                manifest.artifactId,
                manifest.artifactHash,
                manifest.solutionId,
                environment,
                manifest.deploymentMode,
                DeploymentStatus.DEPLOYING,
                userId,
                new Date()
            ]
        );

        if (insertedDeployment.rows.length === 0) {
            const existingDeployment = await db.query(
                `
                SELECT id, status, n8n_workflow_id
                FROM workflow_deployments
                WHERE workflow_version_id = $1
                  AND environment = $2
                LIMIT 1
                `,
                [versionId, environment]
            );

            if (existingDeployment.rows.length === 0) {
                throw new Error('DEPLOYMENT_CREATION_CONFLICT');
            }

            const existing = existingDeployment.rows[0];
            return {
                deploymentId: existing.id,
                status: existing.status as DeploymentStatus,
                n8nWorkflowId: existing.n8n_workflow_id ?? undefined
            };
        }


        // 3. Persist Manifest
        await db.deployment_manifests.create({
            data: {
                id: crypto.randomUUID(),
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
                const currentWorkflow = await this.provider.getWorkflow(targetN8nId);
                const currentContent = JSON.stringify(currentWorkflow);

                await db.deployment_snapshots.create({
                    data: {
                        id: crypto.randomUUID(),
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
                ? await this.provider.createWorkflow(`Operix_${versionId}`, workflowJson)
                : await this.provider.updateWorkflow(targetN8nId!, workflowJson);

            targetN8nId = providerResult.id;

            // 6. Bind Environment
            await db.query(
                `
                INSERT INTO workflow_environment_bindings (
                    id,
                    workflow_version_id,
                    environment,
                    n8n_workflow_id
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (workflow_version_id, environment)
                DO UPDATE SET
                    n8n_workflow_id = EXCLUDED.n8n_workflow_id,
                    updated_at = CURRENT_TIMESTAMP
                `,
                [
                    crypto.randomUUID(),
                    versionId,
                    environment,
                    targetN8nId
                ]
            );
            // 7. Verify Deployment
            const verification = await this.verifier.verify(
        deploymentId,
        targetN8nId!,
        artifactContent
    );
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
                    await this.provider.activateWorkflow(targetN8nId!);
                    await db.workflow_deployments.update({
                        where: { id: deploymentId },
                        data: { status: DeploymentStatus.ACTIVE }
                    });

                    await db.activation_records.create({
                        data: {
                            id: crypto.randomUUID(),
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

        // Atomically claim the activation right.
        // Only one concurrent caller can transition VERIFIED -> ACTIVATING.
        const claimed = await db.query(
            `
            UPDATE workflow_deployments
            SET status = $1
            WHERE id = $2
              AND status = $3
            RETURNING id
            `,
            [
                DeploymentStatus.ACTIVATING,
                deploymentId,
                DeploymentStatus.VERIFIED
            ]
        );

        if (claimed.rows.length !== 1) {
            throw new Error('ACTIVATION_ALREADY_IN_PROGRESS');
        }

        try {
            await this.provider.activateWorkflow(deployment.n8n_workflow_id);

            await db.workflow_deployments.update({
                where: { id: deploymentId },
                data: { status: DeploymentStatus.ACTIVE }
            });

            await db.activation_records.create({
                data: {
                    id: crypto.randomUUID(),
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
            await db.query(
                `
                UPDATE workflow_deployments
                SET status = $1
                WHERE id = $2
                  AND status = $3
                `,
                [
                    DeploymentStatus.VERIFIED,
                    deploymentId,
                    DeploymentStatus.ACTIVATING
                ]
            );

            await db.activation_records.create({
                data: {
                    id: crypto.randomUUID(),
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

