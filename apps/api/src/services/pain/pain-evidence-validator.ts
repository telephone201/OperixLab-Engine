/**
 * @file pain-evidence-validator.ts
 * @description Verifies candidate pains against actual research evidence to prevent fabrication.
 */

import { Pain, PainEvidence, EvidenceLevel } from './pain-types';

export class PainEvidenceValidator {
    /**
     * Validates a candidate pain against the research evidence pool.
     * Ensures that every claim is backed by a source.
     */
    validate(pain: Pain, researchEvidence: any[]): { validatedPain: Pain; confidenceImpact: number } {
        const supportingEvidence: PainEvidence[] = [];
        let contradictions = 0;
        let foundDirectEvidence = false;

        // 1. Trace sources back to actual research evidence IDs
        // In a real implementation, this would match the source IDs provided by the AI
        pain.evidence.forEach(ev => {
            const exists = researchEvidence.some(re => re.id === ev.evidenceId);
            if (exists) {
                supportingEvidence.push(ev);
                if (ev.contributionType === 'SUPPORTING') foundDirectEvidence = true;
                if (ev.contributionType === 'CONTRADICTORY') contradictions++;
            }
        });

        // 2. Truth Classification Override
        let evidenceType: EvidenceLevel = pain.evidenceType;
        if (supportingEvidence.length === 0) {
            evidenceType = 'UNKNOWN';
        } else if (foundDirectEvidence) {
            evidenceType = 'OBSERVED';
        } else {
            evidenceType = 'INFERRED';
        }

        // 3. Confidence Calculation
        let confidence = pain.confidence;
        if (supportingEvidence.length === 0) confidence = 0.2;
        else if (contradictions > 0) confidence *= 0.5;
        else if (supportingEvidence.length > 2) confidence = Math.min(confidence + 0.2, 1.0);

        return {
            validatedPain: {
                ...pain,
                evidence: supportingEvidence,
                evidenceType,
                confidence,
                status: evidenceType === 'UNKNOWN' ? 'NEEDS_RESEARCH' : pain.status,
            },
            confidenceImpact: confidence - pain.confidence,
        };
    }
}
