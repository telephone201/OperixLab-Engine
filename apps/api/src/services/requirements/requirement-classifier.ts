/**
 * @file requirement-classifier.ts
 * @description Maps requirements to taxonomy and calculates deterministic priority.
 */

import { Requirement, RequirementPriority, RequirementType } from './requirement-types';

export class RequirementClassifier {
    /**
     * Assigns priority and taxonomy based on source pain severity and commercial signals.
     */
    classify(
        requirement: Requirement,
        painSeverity: string,
        commercialSignal: 'STRONG' | 'MEDIUM' | 'WEAK'
    ): { priority: RequirementPriority; type: RequirementType } {

        // Deterministic Priority Logic:
        // MUST: (Severity: CRITICAL|HIGH) AND (Commercial Signal: STRONG)
        // SHOULD: (Severity: HIGH|MEDIUM) AND (Commercial Signal: MEDIUM)
        // COULD: Otherwise

        let priority: RequirementPriority = 'COULD';

        if ((painSeverity === 'CRITICAL' || painSeverity === 'HIGH') && commercialSignal === 'STRONG') {
            priority = 'MUST';
        } else if ((painSeverity === 'HIGH' || painSeverity === 'MEDIUM') && commercialSignal === 'MEDIUM') {
            priority = 'SHOULD';
        }

        // Type mapping (could be refined by AI, but we ensure it's within taxonomy)
        const type = requirement.type || 'FUNCTIONAL';

        return { priority, type };
    }
}
