/**
 * @file pain-question-generator.ts
 * @description Generates discovery questions to validate inferred or unknown pains.
 */

import { Pain, EvidenceLevel } from './pain-types';

export class PainQuestionGenerator {
    /**
     * Generates human-facing questions to validate gaps in pain analysis.
     */
    generateQuestions(pains: Pain[]): string[] {
        const questions: string[] = [];

        pains.forEach(pain => {
            if (pain.evidenceType === 'UNKNOWN') {
                questions.push(`How do you currently handle ${pain.title}?`);
            } else if (pain.evidenceType === 'INFERRED') {
                questions.push(`We noticed you may be experiencing ${pain.title}; could you describe the current process?`);
            }
        });

        return questions;
    }
}
