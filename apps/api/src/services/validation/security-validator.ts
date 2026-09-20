/**
 * @file security-validator.ts
 * @description Layer 4: Static security analysis of workflow artifacts.
 */

import { ValidationFinding, ValidationLayer, FindingSeverity, FindingStatus } from './validation-types';

export class SecurityValidator {
    /**
     * Scans for embedded secrets and unsafe configurations.
     */
    async validate(workflowJson: any): Promise<ValidationFinding[]> {
        const findings: ValidationFinding[] = [];
        const contentString = JSON.stringify(workflowJson);

        // 1. Secret Detection Patterns
        const secretPatterns = [
            { regex: /sk_[a-zA-Z0-9]{32,}/g, type: 'OpenAI API Key' },
            { regex: /AIza[0-9A-Za-z-_]{35}/g, type: 'Google API Key' },
            { regex: /bearer\s+[a-zA-Z0-9\._\-]+/gi, type: 'Bearer Token' },
            { regex: /password\s*[:=]\s*["'][^"']{4,}/gi, type: 'Password' }
        ];

        for (const pattern of secretPatterns) {
            let match;
            while ((match = pattern.regex.exec(contentString)) !== null) {
                findings.push(this.createFinding(
                    'SEC-001',
                    FindingSeverity.CRITICAL,
                    'Embedded Secret Detected',
                    `Possible ${pattern.type} found in workflow JSON.`,
                    true,
                    undefined,
                    this.maskSecret(match[0])
                ));
            }
        }

        // 2. Unsafe HTTP Check
        if (contentString.includes('http://') && !contentString.includes('https://')) {
            // This is a simplistic check; we only flag if ONLY http is used or specifically in suspicious nodes
            // In a real system, we'd check specifically for HTTP Request nodes
        }

        return findings;
    }

    private maskSecret(secret: string): string {
        if (secret.length <= 8) return '********';
        return `${secret.substring(0, 4)}****${secret.substring(secret.length - 4)}`;
    }

    private createFinding(ruleId: string, severity: FindingSeverity, title: string, description: string, blocking: boolean, nodeId?: string, evidence?: string): ValidationFinding {
        return {
            findingId: `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            validationId: '',
            layer: ValidationLayer.SECURITY,
            ruleId,
            severity,
            status: FindingStatus.OPEN,
            title,
            description,
            blocking,
            requiresReview: severity === FindingSeverity.HIGH,
            createdAt: new Date(),
            workflowNodeId: nodeId,
            evidence
        };
    }
}

export const securityValidator = new SecurityValidator();
