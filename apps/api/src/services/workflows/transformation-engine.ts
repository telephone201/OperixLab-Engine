/**
 * @file transformation-engine.ts
 * @description Core engine for applying deterministic transformations to workflow artifacts.
 */

import { workflowStructureInspector, WorkflowStructure } from './workflow-structure-inspector';
import { jsonPathResolver } from './json-path-resolver';
import { artifactService } from '../versioning/artifact-service';
import { workflowVersionService } from '../versioning/version-service';
import { OriginType } from '../versioning/version-service';
import { auditLogger } from '../../core/logging/audit-logger';

export enum TransformationType {
    DIRECT = 'DIRECT',
    RENAME = 'RENAME',
    NEST = 'NEST',
    UNNEST = 'UNNEST',
    PICK_FIELD = 'PICK_FIELD',
    MERGE_FIELDS = 'MERGE_FIELDS',
    SPLIT_FIELD = 'SPLIT_FIELD',
    ARRAY_MAP = 'ARRAY_MAP',
    TYPE_CONVERSION = 'TYPE_CONVERSION',
    TEMPLATE = 'TEMPLATE'
}

export interface TransformationOperation {
    operationId: string;
    type: TransformationType;
    sourceNodeId?: string;
    targetNodeId?: string;
    sourcePath?: string;
    targetPath?: string;
    parameters?: any;
    confidence: 'EXACT' | 'HIGH_CONFIDENCE' | 'INFERRED' | 'UNKNOWN';
}

export interface TransformationPlan {
    planId: string;
    sourceArtifactId: string;
    targetArtifactId?: string;
    operations: TransformationOperation[];
    mappings: any[];
    unresolvedItems: string[];
    riskSummary: string;
}

export class TransformationEngine {
    /**
     * Applies a transformation plan to a source artifact to generate a new derived artifact.
     */
    async transform(plan: TransformationPlan): Promise<{ artifactId: string; hash: string }> {
        console.log(`[TRANSFORMATION] Applying plan ${plan.planId}...`);

        // 1. Load source artifact
        const sourceContent = await artifactService.getArtifactContent(plan.sourceArtifactId);
        const workflow = JSON.parse(sourceContent.toString());

        // 2. Apply operations in sequence
        const transformedWorkflow = this.applyOperations(workflow, plan.operations);

        // 3. Generate derived artifact
        const derivedContent = Buffer.from(JSON.stringify(transformedWorkflow, null, 2));

        // 4. Persist as a new artifact
        const { artifactId, hash } = await artifactService.saveArtifact(derivedContent, undefined, false);

        await auditLogger.log({
            action: 'TRANSFORMATION_COMPLETED',
            entityType: 'WorkflowArtifact',
            entityId: artifactId,
            details: { planId: plan.planId, hash }
        });

        return { artifactId, hash };
    }

    private applyOperations(workflow: any, operations: TransformationOperation[]): any {
        let currentWorkflow = JSON.parse(JSON.stringify(workflow)); // Deep copy

        for (const op of operations) {
            switch (op.type) {
                case TransformationType.RENAME:
                    this.applyRename(currentWorkflow, op);
                    break;
                case TransformationType.DIRECT:
                    // Direct is essentially a no-op for the workflow JSON structure itself
                    // unless we are updating a specific parameter.
                    this.applyDirect(currentWorkflow, op);
                    break;
                // Other transformations implemented as needed
                default:
                    console.warn(`[TRANSFORMATION] Unsupported operation type: ${op.type}`);
            }
        }

        return currentWorkflow;
    }

    private applyRename(workflow: any, op: TransformationOperation) {
        if (!op.targetNodeId) return;
        const node = workflow.nodes?.[op.targetNodeId];
        if (node) {
            node.name = op.targetPath; // Simple rename of the node name
        }
    }

    private applyDirect(workflow: any, op: TransformationOperation) {
        if (op.targetNodeId && op.targetPath) {
            const node = workflow.nodes?.[op.targetNodeId];
            if (node && node.parameters) {
                // This is a simplified implementation of path updates
                // In a real system, we would use a JSON path setter
                node.parameters[op.targetPath] = op.parameters || 'VALUE_FROM_SOURCE';
            }
        }
    }
}

export const transformationEngine = new TransformationEngine();
