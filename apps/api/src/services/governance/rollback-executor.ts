/**
 * @file rollback-executor.ts
 * @description Executes the restoration of a Known-Good workflow artifact.
 */

import { n8nProvider } from '../deployment/providers/n8n-provider';
import { KnownGoodVersion } from './types';
import { db } from '../../lib/db';
import { artifactService } from '../versioning/artifact-service';

export class RollbackExecutor {
    /**
     * Performs the actual n8n update to restore a known-good version.
     */
    async executeRollback(params: {
        rollbackId: string;
        target: KnownGoodVersion;
        currentN8nWorkflowId: string;
        environment: string;
    }): Promise<{ success: boolean, n8nWorkflowId: string }> {

        console.log(`[ROLLBACK] Executing restoration of version ${params.target.workflowVersionId} to ${params.currentN8nWorkflowId}...`);

        try {
            // 1. Pre-Rollback Snapshot
            const currentWorkflow = await n8nProvider.getWorkflow(params.currentN8nWorkflowId);
            await db.rollback_snapshots.create({
                data: {
                    id: `rb_snap_${Date.now()}`,
                    rollback_id: params.rollbackId,
                    n8n_workflow_id: params.currentN8nWorkflowId,
                    environment: params.environment,
                    workflow_content: currentWorkflow,
                    workflow_content_hash: require('crypto').createHash('sha256').update(JSON.stringify(currentWorkflow)).digest('hex'),
                    captured_at: new Date()
                }
            });

            // 2. Restore Artifact
            const artifact = await db.workflow_artifacts.findUnique({
                where: { id: (await db.workflow_versions.findUnique({ where: { id: params.target.workflowVersionId } }))!.artifact_id }
            });
            const contentBuffer = await artifactService.getArtifactContent(artifact!.id);
            const workflowJson = JSON.parse(contentBuffer.toString());

            // Use existing N8NProvider to update
            await n8nProvider.updateWorkflow(params.currentN8nWorkflowId, workflowJson);

            // 3. Activate Restored Workflow
            await n8nProvider.activateWorkflow(params.currentN8nWorkflowId);

            return { success: true, n8nWorkflowId: params.currentN8nWorkflowId };
        } catch (error: any) {
            console.error(`[ROLLBACK] Execution error:`, error);
            throw error;
        }
    }
}

export const rollbackExecutor = new RollbackExecutor();

