/**
 * @file commercial-engagement-intent-adapter.ts
 * @description Bridges proposal engagement events to the Phase 5 IntentManager.
 */

import { engagementService } from './engagement-service';
import { db } from '../../lib/db';
import { IntentManager } from '../qualification/intent-manager';
import { IntentEvent, IntentState, IntentStateValue } from '../qualification/intent-types';
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

        // 1. Load the lead's REAL current intent state (latest row per lead,
        // same read pattern as qualification-controller).
        const currentIntentState = await this.loadCurrentIntentState(event.leadId);

        // 2. Transition through the existing Phase 5 state machine.
        const newState = await intentManager.processEvent(signal, currentIntentState);

        // 3. Persist the transition (intent_states upsert + history on change)
        // so commercial evidence becomes observable by Phase 5.
        await this.persistIntentState(event.leadId, currentIntentState, newState, signal);

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

    /**
     * Loads the lead's latest persisted intent state. Falls back to the
     * schema-compatible NO_SIGNAL / zero baseline when no state exists yet.
     */
    private async loadCurrentIntentState(leadId: string): Promise<IntentState> {
        const row = await db.intent_states.findFirst({
            where: { lead_id: leadId },
            orderBy: { updated_at: 'desc' }
        });

        if (!row) {
            return {
                leadId,
                state: 'NO_SIGNAL',
                score: 0,
                confidence: 0,
                lastUpdated: new Date()
            };
        }

        return {
            leadId: row.lead_id,
            state: row.state as IntentStateValue,
            score: row.intent_score ?? 0,
            confidence: 0.8,
            lastUpdated: row.updated_at ?? new Date()
        };
    }

    /**
     * Persists the resulting state: upserts intent_states (022) and appends
     * intent_state_history (005) only when the state actually changed, so the
     * history remains a true transition timeline.
     */
    private async persistIntentState(
        leadId: string,
        previous: IntentState,
        next: IntentState,
        signal: IntentEvent
    ): Promise<void> {
        const existing = await db.intent_states.findFirst({
            where: { lead_id: leadId },
            orderBy: { updated_at: 'desc' }
        });

        if (existing) {
            await db.intent_states.update({
                where: { id: existing.id },
                data: {
                    state: next.state,
                    commercial_signal: signal.eventType,
                    intent_score: next.score,
                    response_summary: signal.evidence,
                    updated_at: next.lastUpdated
                }
            });
        } else {
            await db.intent_states.create({
                data: {
                    lead_id: leadId,
                    state: next.state,
                    commercial_signal: signal.eventType,
                    intent_score: next.score,
                    response_summary: signal.evidence
                }
            });
        }

        if (next.state !== previous.state) {
            await db.query(
                `INSERT INTO intent_state_history
                    (lead_id, state, changed_by, reason)
                 VALUES ($1, $2, $3, $4)`,
                [
                    leadId,
                    next.state,
                    'COMMERCIAL_ENGAGEMENT',
                    `${signal.eventType}: ${previous.state} -> ${next.state}`
                ]
            );
        }
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

            // Design 9.1: PRICING_VIEWED is a HOT signal. Mapped to the
            // existing high-value PRICING_REQUESTED signal recognized by
            // IntentManager.isHighValueSignal.
            case EngagementEventType.PRICING_VIEWED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'PRICING_REQUESTED',
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client viewed the pricing section of the proposal.',
                    timestamp
                };

            case EngagementEventType.DEMO_CLICKED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'COMMERCIAL_INTEREST',
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client interacted with the demo.',
                    timestamp
                };

            // Design 9.1: PROPOSAL_OPENED is a WARM-capable signal. Emitted as
            // a low-rung (non-high-value) signal so the state machine advances
            // the lead one rung instead of ignoring the event.
            case EngagementEventType.PROPOSAL_OPENED:
                return {
                    eventId: `int_evt_${Date.now()}`,
                    leadId,
                    eventType: 'PROPOSAL_OPENED',
                    source: 'COMMERCIAL_ENGAGEMENT',
                    evidence: 'Client opened the proposal.',
                    timestamp
                };

            default:
                // Remaining events are informational and don't trigger intent changes
                return null;
        }
    }
}

export const commercialEngagementIntentAdapter = new CommercialEngagementIntentAdapter();
