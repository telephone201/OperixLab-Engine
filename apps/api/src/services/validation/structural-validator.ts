/**
 * @file structural-validator.ts
 * @description Layer 1: Verifies the internal structural coherence of the workflow artifact.
 */

import { WorkflowStructureInspector, WorkflowStructure } from '../workflows/workflow-structure-inspector';
import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';

export class StructuralValidator {
    constructor(private inspector: WorkflowStructureInspector) {}

    async validate(workflowJson: any): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];

        try {
            const structure = this.inspector.inspect(workflowJson);

            // 1. Node ID Uniqueness (Implicitly handled by inspector's Object.entries,
            // but we check for any duplicate IDs if nodes were provided as an array)
            if (Array.isArray(workflowJson.nodes)) {
                const ids = workflowJson.nodes.map((n: any) => n.id);
                if (new Set(ids).size !== ids.length) {
                    findings.push(this.createFinding(
                        'STR-001',
                        FindingSeverity.CRITICAL,
                        'Duplicate Node IDs',
                        'The workflow contains multiple nodes with the same identifier.',
                        true
                    ));
                }
            }

            // 2. Connection Integrity
            structure.connections.forEach(conn => {
                const sourceExists = structure.nodes.find(n => n.id === conn.sourceNode);
                const targetExists = structure.nodes.find(n => n.id === conn.targetNode);

                if (!sourceExists) {
                    findings.push(this.createFinding(
                        'STR-002',
                        FindingSeverity.CRITICAL,
                        'Broken Connection Source',
                        `Connection source node ${conn.sourceNode} does not exist.`,
                        true,
                        conn.sourceNode
                    ));
                }
                if (!targetExists) {
                    findings.push(this.createFinding(
                        'STR-003',
                        FindingSeverity.CRITICAL,
                        'Broken Connection Target',
                        `Connection target node ${conn.targetNode} does not exist.`,
                        true,
                        conn.targetNode
                    ));
                }
            });

            // 3. Basic metadata check
            if (!workflowJson.nodes || Object.keys(workflowJson.nodes).length === 0) {
                findings.push(this.createFinding(
                    'STR-004',
                    FindingSeverity.CRITICAL,
                    'Empty Workflow',
                    'The workflow artifact contains no nodes.',
                    true
                ));
            }

        } catch (e: any) {
            findings.push(this.createFinding(
                'STR-000',
                FindingSeverity.CRITICAL,
                'Malformed JSON',
                `Workflow artifact is not a valid JSON object: ${e.message}`,
                true
            ));
        }

        return findings;
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '', // Set by orchestrator
            layer: ValidationLayer.STRUCTURAL,
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

export const structuralValidator = new StructuralValidator(workflowStructureInspector);
