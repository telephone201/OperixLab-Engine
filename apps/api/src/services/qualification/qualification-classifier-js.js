/**
 * @file qualification-classifier-js.js
 */
class QualificationClassifier {
    classify(leadId, components, threshold = 50) {
        const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
        const maxScore = components.reduce((sum, comp) => sum + comp.max_score, 0);

        let label = 'REJECT';
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

module.exports = { QualificationClassifier };
