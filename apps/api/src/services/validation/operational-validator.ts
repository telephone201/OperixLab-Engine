/**
 * @file operational-validator.ts
 * @description Layer 6: Identifies static operational risks before deployment.
 */

import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';
import { WorkflowStructure } from '../workflows/workflow-structure-inspector';

export class OperationalValidator {
    /**
     * Analyzes the workflow for operational risks.
     */
    async validate(workflowJson: any, structure: WorkflowStructure): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];

        // 1. Trigger Validation
        if (structure.triggerNodes.length === 0) {
            findings.push(this.createFinding(
                'OPS-001',
                FindingSeverity.CRITICAL,
                'Missing Trigger',
                'The workflow has no identifiable trigger node, making it unexecutable.',
                true
            ));
        }

        // 2. Execution Path Analysis (Dead-ends)
        structure.nodes.forEach(node => {
            const isTrigger = structure.triggerNodes.includes(node.id);
            const isOutput = structure.outputNodes.includes(node.id);
            const isConnectedToOthers = structure.connections.some(c => c.sourceNode === node.id || c.targetNode === node.id);

            if (!isTrigger && !isConnectedToOthers) {
                findings.push(this.createFinding(
                    'OPS-002',
                    FindingSeverity.MEDIUM,
                    'Orphaned Node',
                    `Node ${node.id} (${node.name}) is not connected to any other node.`,
                    false,
                    node.id
                ));
            }
        });

        // 3. Error Handling Check
        const hasErrorHandling = this.detectErrorHandling(workflowJson);
        if (!hasErrorHnadling) {
            findings.push(this.createFinding(
                'OPS-003',
                FindingSeverity.LOW,
                'Missing Error Handling',
                'No explicit error handling nodes or paths detected. Failures may result in silent termination.',
                false
            ));
        }

        return findings;
    }

    private detectErrorHandling(workflow: any): boolean {
        // Simplified: check for nodes with 'Error' in name or specific error-handling types
        const nodes = workflow.nodes || {};
        return Object.values(nodes).some((n: any) =>
            n.name?.toLowerCase().includes('error') ||
            n.type?.toLowerCase().includes('error')
        );
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '',
            layer: ValidationLayer.OPERATIONAL,
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

export const operationalValidator = new OperationalValidator();
