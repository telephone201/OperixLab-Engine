/**
 * @file requirement-validator.ts
 * @description The "Evidence Gatekeeper" that prevents fabrication and solutioning.
 */

import { Requirement, RequirementCertainty } from './requirement-types';

export class RequirementValidator {
    /**
     * Validates a candidate requirement against research evidence and a solution-neutrality policy.
     */
    validate(requirement: Requirement, researchEvidence: any[]): { isValid: boolean; reason?: string; updatedCertainty: RequirementCertainty } {
        // 1. Check for "Solutioning" (Forbidden terms)
        const forbiddenTerms = ['n8n', 'zapier', 'make.com', 'webhook', 'api endpoint', 'node', 'workflow'];
        const content = (requirement.description + ' ' + requirement.title).toLowerCase();

        for (const term of forbiddenTerms) {
            if (content.includes(term)) {
                return { isValid: false, reason: `Solutioning Violation: Requirement contains forbidden technical term "${term}".`, updatedCertainty: 'UNKNOWN' };
            }
        }

        // 2. Evidence Traceability Check
        const hasEvidence = requirement.evidence && requirement.evidence.length > 0;

        if (!hasEvidence) {
            return {
                isValid: true,
                reason: 'No supporting evidence found; downgraded to UNKNOWN.',
                updatedCertainty: 'UNKNOWN'
            };
        }

        // 3. Verify evidence IDs exist in the research pool
        const validEvidence = requirement.evidence.filter(ev =>
            researchEvidence.some(re => re.id === ev.evidenceId)
        );

        if (validEvidence.length === 0) {
            return {
                isValid: true,
                reason: 'Provided evidence IDs do not exist in the research pool.',
                updatedCertainty: 'UNKNOWN'
            };
        }

        return {
            isValid: true,
            updatedCertainty: requirement.certainty
        };
    }
}
