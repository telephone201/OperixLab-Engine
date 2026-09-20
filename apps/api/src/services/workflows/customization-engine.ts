/**
 * @file customization-engine.ts
 * @description Orchestrates the transformation of a source workflow into a client instance.
 */

import { transformationEngine, TransformationPlan, TransformationOperation, TransformationType } from './transformation-engine';
import { workflowStructureInspector } from './workflow-structure-inspector';
import { workflowVersionService, OriginType } from '../versioning/version-service';
import { artifactService } from '../versioning/artifact-service';
import { auditLogger } from '../../core/logging/audit-logger';

export interface CustomizationRequest {
    solutionId: string;
    sourceWorkflowId: string;
    customizationPlan: any; // Defined by Phase 8 blueprint/requirements
    createdBy?: string;
}

export class CustomizationEngine {
    /**
     * Customizes a workflow based on a provided plan.
     */
    async customize(req: CustomizationRequest): Promise<{ versionId: string; versionNumber: number }> {
        console.log(`[CUSTOMIZATION] Customizing workflow ${req.sourceWorkflowId}...`);

        // 1. Load source artifact
        const sourceArtifact = await this.getSourceArtifact(req.sourceWorkflowId);
        const sourceContent = await artifactService.getArtifactContent(sourceArtifact.id);
        const workflowJson = JSON.parse(sourceContent.toString());

        // 2. Inspect structure to validate customization plan
        const structure = workflowStructureInspector.inspect(workflowJson);

        // 3. Generate Transformation Plan
        const transPlan = this.generateTransformationPlan(req, structure);

        // 4. Execute Transformation
        const { artifactId, hash } = await transformationEngine.transform(transPlan);

        // 5. Create new version in the chain
        const { versionId, versionNumber } = await workflowVersionService.createVersion({
            solutionId: req.solutionId,
            workflowSourceId: req.sourceWorkflowId,
            content: await artifactService.getArtifactContent(artifactId),
            originType: OriginType.CUSTOMIZED,
            changeSummary: `Customized based on plan: ${JSON.stringify(req.customizationPlan)}`,
            createdBy: req.createdBy
        });

        await auditLogger.log({
            action: 'CUSTOMIZATION_COMPLETED',
            entityType: 'WorkflowVersion',
            entityId: versionId,
            details: { sourceId: req.sourceWorkflowId, artifactId }
        });

        return { versionId, versionNumber };
    }

    private async getSourceArtifact(workflowId: string): Promise<{ id: string }> {
        // This would ideally look up the original artifact for the workflow_library item
        // For now, we assume we can find the original artifact by source_hash
        // in a real implementation, we'd query workflow_library -> source_hash -> workflow_artifacts
        const artifact = await artifactService.saveArtifact(Buffer.from('{}'), workflowId, true);
        return { id: artifact.artifactId };
    }

    private generateTransformationPlan(req: CustomizationRequest, structure: any): TransformationPlan {
        const operations: TransformationOperation[] = [];
        const unresolvedItems: string[] = [];

        // Map customization requests to operations
        for (const change of req.customizationPlan.changes) {
            if (change.type === 'RENAME_NODE') {
                operations.push({
                    operationId: `op_${Date.now()}`,
                    type: TransformationType.RENAME,
                    targetNodeId: change.nodeId,
                    targetPath: change.newName,
                    confidence: 'EXACT'
                });
            } else {
                unresolvedItems.push(`Unsupported change type: ${change.type}`);
            }
        }

        return {
            planId: `plan_${Date.now()}`,
            sourceArtifactId: 'some_id', // Linked in actual call
            operations,
            mappings: [],
            unresolvedItems,
            riskSummary: unresolvedItems.length > 0 ? 'Requires review' : 'Low risk'
        };
    }
}

export const customizationEngine = new CustomizationEngine();
