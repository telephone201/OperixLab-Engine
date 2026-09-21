/**
 * @file commercial-engagement-intent-adapter.ts
 * @description Bridges proposal engagement events to the Phase 5 IntentManager.
 */

import { engagementService } from './engagement-service';
import { IntentManager } from '../qualification/intent-manager';
import { IntentEvent, IntentStateValue } from '../qualification/intent-types';
import { EngagementEventType } from './engagement-types';
import { auditLogger } from '../../core/logging/audit-logger';

const intentManager = new IntentManager();

export class CommercialEngagementIntentAdapter {
    /**
     * Normalizes a commercial engagement event into an intent signal.
     * Forwards the signal to the existing Phase 5 IntentManager.
     */
    async processEngagementToIntent(event: any): Promise<void> {
        const signal = this.mapEventToIntentSignal(event);

        if (!signal) return; // Some events are purely informational and don't trigger intent changes

        // Get current intent state for the lead
        // In a real impl, we'd fetch the actual IntentState from the DB
        const currentIntentState = {
            leadId: event.leadId,
            state: 'LOW_INTENT' as IntentStateValue, // Default mock
            score: 20,
            confidence: 0.5,
            lastUpdated: new Date()
        };

        const newState = await intentManager.processEvent(signal, currentIntentState);

        await auditLogger.log({
            action: 'COMMERCIAL_INTENT_SIGNAL_PROCESSED',
            entityType: 'IntentState',
            entityId: event.leadId,
            details: {
                eventType: event.eventType,
                previousState: currentIntentState.state,
                newState: newState.state
            }
        });
    }

    private mapEventToIntentSignal(event: { leadId: string, eventType: EngagementEventType, timestamp: Date, metadata?: any }): IntentEvent | null {
        const { leadId, eventType, timestamp } = event;

        // Deterministic mapping of Engagement events to Intent signals
        switch (eventType) {
            case EngagementEventType.MEETING_BOOKED:
            case EngagementEventType.MEETING_REQUESTED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'READY_TO_BUY', // High value override in Phase 5
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client explicitly booked/requested a meeting via proposal.',
                    timestamp
                };

            case EngagementEventType.CTA_CLICKED:
            case EngagementEventType.CONTACT_CLICKED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'HIGH_VALUE_SIGNAL',
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client clicked a primary call-to-action in the proposal.',
                    timestamp
                };

            case EngagementEventType.PRICING_VIEWED:
            case EngagementEventType.DEMO_CLICKED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'COMMERCIAL_INTEREST',
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client viewed pricing or interacted with the demo.',
                    timestamp
                };

            default:
                // PROPOSAL_OPENED etc are informational and don't necessarily trigger state changes
                return null;
        }
    }
}

export const commercialEngagementIntentAdapter = new CommercialEngagementIntentAdapter();
