/**
 * @file composition-impl.ts
 * @description Converts a Phase 8 Composition Blueprint into an executable workflow artifact.
 */

import { transformationEngine, TransformationOperation, TransformationType, TransformationPlan } from './transformation-engine';
import { workflowStructureInspector } from './workflow-structure-inspector';
import { workflowVersionService, OriginType } from '../versioning/version-service';
import { artifactService } from '../versioning/artifact-service';
import { auditLogger } from '../../core/logging/audit-logger';

export interface CompositionBlueprint {
    compositionId: string;
    solutionId: string;
    components: {
        workflowId: string;
        role: string;
        coveredRequirements: string[];
    }[];
    executionOrder: string[];
    triggerModel: {
        primaryTrigger: string;
        sequencing: string;
    };
    mappings: {
        sourceWorkflowId: string;
        sourceField: string;
        targetWorkflowId: string;
        targetField: string;
        transformation: string;
        isRequired: boolean;
    }[];
    conflicts: string[];
    unresolvedItems: string[];
}

export class CompositionImpl {
    /**
     * Transforms a conceptual blueprint into a derived composed artifact.
     */
    async implementComposition(blueprint: CompositionBlueprint): Promise<{ versionId: string; versionNumber: number }> {
        console.log(`[COMPOSITION_IMPL] Implementing composition ${blueprint.compositionId}...`);

        // 1. Resolve all source artifacts
        const components = [];
        for (const workflowId of blueprint.executionOrder) {
            const content = await this.resolveSourceContent(workflowId);
            components.push({ workflowId, content });
        }

        // 2. Generate the composed JSON
        // This is a simplified merging logic: we combine nodes and connections
        const composedJson = this.mergeWorkflows(components, blueprint);

        // 3. Generate Transformation Plan for auditability
        const transPlan: TransformationPlan = {
            planId: `comp_plan_${blueprint.compositionId}`,
            sourceArtifactId: 'composite_root',
            operations: this.generateCompositionOperations(blueprint),
            mappings: blueprint.mappings,
            unresolvedItems: blueprint.unresolvedItems,
            riskSummary: blueprint.conflicts.length > 0 ? 'Conflicts detected' : 'Low risk'
        };

        // 4. Persist as a new artifact
        const contentBuffer = Buffer.from(JSON.stringify(composedJson, null, 2));
        const { artifactId, hash } = await artifactService.saveArtifact(contentBuffer, undefined, false);

        // 5. Create a composed version
        const { versionId, versionNumber } = await workflowVersionService.createVersion({
            solutionId: blueprint.solutionId,
            content: contentBuffer,
            originType: OriginType.COMPOSED,
            changeSummary: `Composed from: ${blueprint.executionOrder.join(', ')}`,
        });

        // 6. Link multiple sources to this version (using the table created in Step 1)
        // In a real implementation, we'd call a lineage service here.

        await auditLogger.log({
            action: 'COMPOSITION_IMPLEMENTATION_COMPLETED',
            entityType: 'WorkflowVersion',
            entityId: versionId,
            details: { compositionId: blueprint.compositionId, artifactId }
        });

        return { versionId, versionNumber };
    }

    private async resolveSourceContent(workflowId: string): Promise<any> {
        // Mock: In real system, lookup workflow_library -> source_file -> read file
        return { nodes: {}, connections: [] };
    }

    private mergeWorkflows(components: any[], blueprint: CompositionBlueprint): any {
        const finalNodes: Record<string, Record<string, any>> = {};
        const finalConnections: Record<string, any>[] = [];

        components.forEach((comp, index) => {
            const nodes = comp.content.nodes || {};
            // Remap node IDs to avoid collisions in the composed workflow
            for (const [id, node] of Object.entries(nodes)) {
                const newId = `${comp.workflowId}_${id}`;
                const nodeObject = node as Record<string, any>;
                finalNodes[newId] = { ...nodeObject, id: newId };
            }

            // Map connections to new IDs
            const conns = comp.content.connections || [];
            conns.forEach((conn: any) => {
                finalConnections.push({
                    ...conn,
                    source: `${comp.workflowId}_${conn.source}`,
                    target: `${comp.workflowId}_${conn.target}`
                });
            });
        });

        return {
            nodes: finalNodes,
            connections: finalConnections
        };
    }

    private generateCompositionOperations(blueprint: CompositionBlueprint): TransformationOperation[] {
        const ops: TransformationOperation[] = [];

        // Map the blueprint's data mappings to specific transformation operations
        blueprint.mappings.forEach((map, index) => {
            ops.push({
                operationId: `map_${index}`,
                type: TransformationType.DIRECT,
                sourceNodeId: map.sourceWorkflowId,
                targetNodeId: map.targetWorkflowId,
                sourcePath: map.sourceField,
                targetPath: map.targetField,
                confidence: 'EXACT'
            });
        });

        return ops;
    }
}

export const compositionImpl = new CompositionImpl();
