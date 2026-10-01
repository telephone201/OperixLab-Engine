import { QualificationResult } from '../qualification/qualification-types';

export interface QualificationPromptContext {
    summary: string;
    commercialSignals: string[];
}

export class QualificationContextAdapter {
    build(result: QualificationResult): QualificationPromptContext {
        const componentLines = result.components.map(component =>
            `- ${component.componentName}: ${component.score}/${component.max_score} (Confidence: ${component.confidence}) — ${component.reasoning}`
        );

        const commercialComponent = result.components.find(
            component => component.componentName === 'Commercial Potential'
        );

        const commercialSignals = commercialComponent
            ? [commercialComponent.reasoning]
            : [];

        const summary = [
            `Qualification: ${result.label}`,
            `Score: ${result.totalScore}/${result.maxScore}`,
            `Threshold: ${result.threshold}`,
            `Qualified: ${result.qualified}`,
            `Version: ${result.version}`,
            '',
            'Scoring Components:',
            ...componentLines
        ].join('\n');

        return {
            summary,
            commercialSignals
        };
    }
}

export const qualificationContextAdapter = new QualificationContextAdapter();
