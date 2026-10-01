/**
 * @file dependency-validator.ts
 * @description Layer 2: Verifies that all workflow dependencies are represented and resolvable.
 */

import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';
import { WorkflowStructure } from '../workflows/workflow-structure-inspector';

export class DependencyValidator {
    /**
     * Validates dependencies such as credentials, env vars, and external services.
     */
    async validate(workflowJson: any, structure: WorkflowStructure): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];

        // 1. Scan nodes for credential references
        structure.nodes.forEach(node => {
            const params = node.parameters;
            if (!params) return;

            // Detect common credential patterns in n8n parameters
            // e.g., { "credentials": { "crmApi": { "id": "..." } } }
            if (params.credentials) {
                for (const [credName, credValue] of Object.entries(params.credentials)) {
                    const credential = credValue as { id?: unknown } | null;
                    if (!credential || typeof credential !== 'object' || !credential.id) {
                        findings.push(this.createFinding(
                            'DEP-001',
                            FindingSeverity.HIGH,
                            'Invalid Credential Reference',
                            `Node ${node.id} references credential ${credName} but no valid ID is provided.`,
                            true,
                            node.id
                        ));
                    }
                }
            }
        });

        // 2. Scan for environment variable references
        // n8n expressions use the form: {{ .VAR_NAME }}
        const jsonString = JSON.stringify(workflowJson);
        const envRegex = /\{\{\s*(?:\$env\.|\.)?([\w]+)\s*\}\}/g;
        let match;
        while ((match = envRegex.exec(jsonString)) !== null) {
            const varName = match[1];

            // Never expose or persist the value of an environment variable.
            // Validation only determines whether the referenced dependency exists.
            if (!process.env[varName]) {
                findings.push(this.createFinding(
                    'DEP-002',
                    FindingSeverity.HIGH,
                    'Missing Environment Variable',
                    'Workflow references environment variable ' + varName + ', but it is not available in the runtime environment.',
                    true
                ));
            }
        }

        return findings;
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '',
            layer: ValidationLayer.DEPENDENCY,
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

export const dependencyValidator = new DependencyValidator();
