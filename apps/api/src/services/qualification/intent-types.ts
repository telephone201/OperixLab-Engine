/**
 * @file intent-types.ts
 * @description Core types for the Intent and Commercial Signal system.
 */

export type IntentStateValue = 'NO_SIGNAL' | 'LOW_INTENT' | 'WARM' | 'HOT' | 'READY_TO_BUY';

export interface IntentEvent {
    eventId: string;
    leadId: string;
    eventType: string; // e.g., 'PRICING_REQUESTED', 'MEETING_BOOKED'
    source: string; // e.g., 'EMAIL', 'FORM', 'MANUAL'
    evidence: string;
    timestamp: Date;
}

export interface IntentState {
    leadId: string;
    state: IntentStateValue;
    score: number;
    confidence: number;
    lastUpdated: Date;
}

export interface CommercialSignal {
    signalType: string;
    value: any;
    timestamp: Date;
}
