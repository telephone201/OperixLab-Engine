/**
 * @file qualification-classifier.ts
 * @description Aggregates score components and classifies leads into priority buckets.
 */

import { QualificationResult, ScoreComponent } from './qualification-types';

export class QualificationClassifier {
    /**
     * Classifies a lead based on their aggregated score components.
     */
    classify(
        leadId: string,
        components: ScoreComponent[],
        threshold: number = 50
    ): QualificationResult {
        const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
        const maxScore = components.reduce((sum, comp) => sum + comp.max_score, 0);

        let label: QualificationResult['label'] = 'REJECT';

        if (totalScore >= 80) {
            label = 'PRIORITY_A';
        } else if (totalScore >= 60) {
            label = 'PRIORITY_B';
        } else if (totalScore >= 50) {
            label = 'NURTURE';
        } else {
            label = 'REJECT';
        }

        return {
            leadId,
            totalScore,
            maxScore,
            threshold,
            qualified: totalScore >= threshold,
            label,
            components,
            version: 1,
            calculatedAt: new Date(),
        };
    }
}
