/**
 * @file data-validator.ts
 * @description Layer 3: Verifies data flow, schema compatibility and mapping consistency.
 */

import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';
import { WorkflowStructure } from '../workflows/workflow-structure-inspector';
import { jsonPathResolver, MappingConfidence } from '../workflows/json-path-resolver';

export interface DataMapping {
    sourceNodeId: string;
    sourcePath: string;
    targetNodeId: string;
    targetPath: string;
    transformationType: string;
}

export class DataValidator {
    /**
     * Validates data mappings against the generated artifact.
     */
    async validate(
        workflowJson: any,
        structure: WorkflowStructure,
        mappings: DataMapping[]
    ): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];

        if (!mappings || mappings.length === 0) {
            // If a composition or customization was performed, we expect mappings.
            // However, for simple REUSE, mappings might be empty.
            return [];
        }

        for (const map of mappings) {
            // 1. Verify nodes exist
            const sourceNode = structure.nodes.find(n => n.id === map.sourceNodeId);
            const targetNode = structure.nodes.find(n => n.id === map.targetNodeId);

            if (!sourceNode || !targetNode) {
                findings.push(this.createFinding(
                    'DATA-001',
                    FindingSeverity.CRITICAL,
                    'Mapping Node Missing',
                    `Mapping references node ${!sourceNode ? map.sourceNodeId : map.targetNodeId} which does not exist.`,
                    true,
                    map.sourceNodeId || map.targetNodeId
                ));
                continue;
            }

            // 2. Path resolution check
            // We check if the target path is actually used in the target node's parameters
            const targetParams = JSON.stringify(targetNode.parameters);
            if (!targetParams.includes(map.targetPath)) {
                findings.push(this.createFinding(
                    'DATA-002',
                    FindingSeverity.HIGH,
                    'Target Path Unused',
                    `Target path ${map.targetPath} is mapped but not utilized in node ${map.targetNodeId} parameters.`,
                    false,
                    map.targetNodeId
                ));
            }
        }

        return findings;
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '',
            layer: ValidationLayer.DATA,
            ruleId,
            severity,
            status: FindingStatus.OPEN,
            title,
            description,
            blocking,
            requiresReview: severity === FindingSeverity.HIGH,
            createdAt: new Date(),
            workflowNodeId: nodeId
        };
    }
}

export const dataValidator = new DataValidator();
