/**
 * @file business-validator.ts
 * @description Layer 5: Verifies that the artifact satisfies approved business requirements.
 */

import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';

export class BusinessValidator {
    /**
     * Checks for requirement traceability.
     */
    async validate(
        workflowJson: any,
        requirements: any[],
        solutionArchitecture: any
    ): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];

        // 1. MUST Requirement Traceability
        const mustReqs = requirements.filter(r => r.priority === 'MUST');

        for (const req of mustReqs) {
            const isSatisfied = this.verifyRequirementImplementation(workflowJson, req);
            if (!isSatisfied) {
                findings.push(this.createFinding(
                    'BUS-001',
                    FindingSeverity.CRITICAL,
                    'MUST Requirement Unsatisfied',
                    `Requirement ${req.id} (${req.title}) has no detectable implementation in the artifact.`,
                    true
                ));
            }
        }

        return findings;
    }

    private verifyRequirementImplementation(workflow: any, req: any): boolean {
        // In a real system, this uses the Solution Architecture's mapping of
        // Requirement -> Node/Transformation.
        // For this implementation, we check if the requirement title or keywords
        // appear in any node names or parameters.
        const content = JSON.stringify(workflow).toLowerCase();
        const keywords = req.title.toLowerCase().split(' ');

        return keywords.some(kw => kw.length > 3 && content.includes(kw));
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '',
            layer: ValidationLayer.BUSINESS,
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

export const businessValidator = new BusinessValidator();
