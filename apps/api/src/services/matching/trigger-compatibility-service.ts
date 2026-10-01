import { WorkflowTriggerEvidence } from '../inventory/workflow-evidence-extractor';

export type TriggerCompatibilityStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface TriggerCompatibilityResult {
    status: TriggerCompatibilityStatus;
    reason: string;
    evidence: string;
}

export class TriggerCompatibilityService {
    evaluate(
        requirementTrigger: unknown,
        observedTriggers: WorkflowTriggerEvidence[]
    ): TriggerCompatibilityResult {
        if (
            typeof requirementTrigger !== 'string' ||
            requirementTrigger.trim().length === 0
        ) {
            return {
                status: 'UNKNOWN',
                reason: 'Trigger compatibility cannot be established because no trigger requirement was supplied.',
                evidence: 'No trigger_definition was provided.'
            };
        }

        if (!Array.isArray(observedTriggers) || observedTriggers.length === 0) {
            return {
                status: 'UNKNOWN',
                reason: 'Trigger compatibility cannot be established because no source trigger evidence was observed.',
                evidence: 'Workflow source contains no extracted trigger evidence.'
            };
        }

        const required = requirementTrigger.trim().toLowerCase();

        const exactMatch = observedTriggers.find(trigger =>
            typeof trigger.triggerType === 'string' &&
            trigger.triggerType.trim().toLowerCase() === required
        );

        if (exactMatch) {
            return {
                status: 'PASS',
                reason: 'Requirement trigger exactly matches an observed technical trigger.',
                evidence: `Requirement trigger "${requirementTrigger}" matched source trigger "${exactMatch.triggerType}" on node "${exactMatch.nodeName}".`
            };
        }

        const technicalTriggerNames = new Set([
            'webhook',
            'schedule',
            'google drive',
            'manual',
            'error',
            'event'
        ]);

        if (!technicalTriggerNames.has(required)) {
            return {
                status: 'UNKNOWN',
                reason: 'The requirement trigger is expressed as a business-level condition and cannot be deterministically mapped to a technical trigger from the available evidence.',
                evidence: `Business trigger "${requirementTrigger}" does not exactly match an observed technical trigger. Observed triggers: ${observedTriggers.map(trigger => trigger.triggerType).filter(Boolean).join(', ') || 'none'}.`
            };
        }

        return {
            status: 'FAIL',
            reason: 'The explicitly required technical trigger was not observed in the workflow source.',
            evidence: `Required technical trigger "${requirementTrigger}" was not observed. Observed triggers: ${observedTriggers.map(trigger => trigger.triggerType).filter(Boolean).join(', ') || 'none'}.`
        };
    }
}

export const triggerCompatibilityService = new TriggerCompatibilityService();
