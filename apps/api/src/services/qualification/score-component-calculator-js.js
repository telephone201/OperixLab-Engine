/**
 * @file score-component-calculator-js.js
 */
const DEFAULT_WEIGHTS = {
    icpFit: 30,
    automationOpportunity: 25,
    decisionMaker: 15,
    commercialPotential: 15,
    dataConfidence: 10,
    demoPotential: 5,
};

class ScoreComponentCalculator {
    calculate(componentName, evidence, maxScore) {
        let score = 0;
        let reasoning = '';
        let confidence = 0;
        switch (componentName) {
            case 'ICP Fit':
                if (evidence.industry && evidence.targetIndustry?.includes(evidence.industry)) {
                    score = maxScore;
                    reasoning = `Industry ${evidence.industry} is a primary target.`;
                    confidence = 1.0;
                } else {
                    score = maxScore * 0.3;
                    reasoning = 'Industry is not a primary target or unknown.';
                    confidence = 0.5;
                }
                break;
            case 'Automation Opportunity':
                const signals = evidence.automationSignals || [];
                if (signals.length > 0) {
                    const positiveSignals = signals.filter(s => s.value === true).length;
                    score = (positiveSignals / signals.length) * maxScore;
                    reasoning = `Observed ${positiveSignals} automation signals.`;
                    confidence = 0.8;
                } else {
                    score = 0;
                    reasoning = 'No automation signals observed.';
                    confidence = 0.4;
                }
                break;
            case 'Decision Maker':
                if (evidence.decisionMaker && evidence.decisionMaker.verified_status === 'VERIFIED') {
                    score = maxScore;
                    reasoning = `Verified Decision Maker found: ${evidence.decisionMaker.person_name}.`;
                    confidence = 1.0;
                } else if (evidence.decisionMaker) {
                    score = maxScore * 0.5;
                    reasoning = 'Decision Maker identified but not verified.';
                    confidence = 0.6;
                } else {
                    score = 0;
                    reasoning = 'No Decision Maker identified.';
                    confidence = 0.3;
                }
                break;
            case 'Commercial Potential':
                if (evidence.employeeCount && evidence.employeeCount > 50) {
                    score = maxScore;
                    reasoning = 'Company size indicates high commercial potential.';
                    confidence = 0.9;
                } else {
                    score = maxScore * 0.5;
                    reasoning = 'Smaller company size; potential is moderate.';
                    confidence = 0.7;
                }
                break;
            case 'Data Confidence':
                const totalEvidence = evidence.evidenceCount || 0;
                if (totalEvidence > 5) {
                    score = maxScore;
                    reasoning = 'High volume of evidence available.';
                    confidence = 1.0;
                } else if (totalEvidence > 0) {
                    score = maxScore * 0.6;
                    reasoning = 'Limited evidence available.';
                    confidence = 0.7;
                } else {
                    score = 0;
                    reasoning = 'No evidence found.';
                    confidence = 0.2;
                }
                break;
            case 'Demo Potential':
                if (evidence.websiteQuality === 'HIGH') {
                    score = maxScore;
                    reasoning = 'Clear digital presence makes for a high-impact demo.';
                    confidence = 0.8;
                } else {
                    score = maxScore * 0.4;
                    reasoning = 'Generic or poor digital presence.';
                    confidence = 0.6;
                }
                break;
            default:
                score = 0;
                reasoning = 'Unknown component.';
                confidence = 0;
        }
        return { componentName, score, max_score: maxScore, reasoning, confidence };
    }
}

module.exports = { ScoreComponentCalculator, DEFAULT_WEIGHTS };
