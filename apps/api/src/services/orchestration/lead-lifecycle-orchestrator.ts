/**
 * @file lead-lifecycle-orchestrator.ts
 * @description Thin orchestration layer above the domain services. Sequences
 * lifecycle steps across domains (Research completion -> Qualification)
 * without coupling the domain services to each other.
 */

import { qualificationService } from '../qualification/qualification-service';
import { QualificationResult } from '../qualification/qualification-types';
import { auditLogger } from '../../core/logging/audit-logger';

export type ResearchQualificationOutcome =
    | { status: 'COMPLETED'; qualification: QualificationResult }
    | { status: 'FAILED'; error: string };

export class LeadLifecycleOrchestrator {
    /**
     * Runs downstream lifecycle steps after Research persistence has fully
     * committed. Never throws: a Qualification failure must never fail the
     * Research response or roll back persisted Research data.
     */
    async onResearchPersisted(leadId: string): Promise<ResearchQualificationOutcome> {
        try {
            const qualification = await qualificationService.calculateAndSave(leadId);

            await auditLogger.log({
                action: 'QUALIFICATION_TRIGGERED_BY_RESEARCH',
                entityType: 'Qualification',
                entityId: leadId,
                details: {
                    label: qualification.label,
                    totalScore: qualification.totalScore
                }
            });

            return { status: 'COMPLETED', qualification };
        } catch (error: any) {
            await auditLogger.log({
                action: 'QUALIFICATION_TRIGGER_FAILED',
                entityType: 'Qualification',
                entityId: leadId,
                details: {
                    error: error.message
                }
            });

            return { status: 'FAILED', error: error.message };
        }
    }
}

export const leadLifecycleOrchestrator = new LeadLifecycleOrchestrator();
