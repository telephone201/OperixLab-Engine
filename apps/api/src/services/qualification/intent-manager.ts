/**
 * @file intent-manager.ts
 * @description State machine for tracking commercial intent and processing signals.
 */

import { IntentStateValue, IntentEvent, IntentState } from './intent-types';

export class IntentManager {
    /**
     * Deterministic state machine for intent transitions.
     * Logic:
     * - NO_SIGNAL -> LOW_INTENT (Any positive signal)
     * - LOW_INTENT -> WARM (Repeated signals or engagement)
     * - WARM -> HOT (High value signals: Pricing, Demo Request)
     * - ANY -> HOT (Deterministic override: READY_TO_BUY event)
     */
    async processEvent(event: IntentEvent, currentState: IntentState): Promise<IntentState> {
        let newState = currentState.state;
        let newScore = currentState.score;
        let newConfidence = currentState.confidence;

        // 1. Deterministic Override: READY_TO_BUY logic
        if (event.eventType === 'READY_TO_BUY') {
            newState = 'HOT';
            newScore = 100;
            newConfidence = 1.0;
            return {
                leadId: currentState.leadId,
                state: newState,
                score: newScore,
                confidence: newConfidence,
                lastUpdated: new Date(),
            };
        }

        // 2. Standard Transition Logic
        switch (currentState.state) {
            case 'NO_SIGNAL':
                if (this.isHighValueSignal(event.eventType)) {
                    newState = 'HOT';
                    newScore = 80;
                } else {
                    newState = 'LOW_INTENT';
                    newScore = 20;
                }
                break;

            case 'LOW_INTENT':
                if (this.isHighValueSignal(event.eventType)) {
                    newState = 'HOT';
                    newScore = 80;
                } else {
                    newState = 'WARM';
                    newScore = 40;
                }
                break;

            case 'WARM':
                if (this.isHighValueSignal(event.eventType)) {
                    newState = 'HOT';
                    newScore = 80;
                } else {
                    newState = 'WARM'; // Stay warm, increase score
                    newScore = Math.min(currentState.score + 10, 79);
                }
                break;

            case 'HOT':
                newState = 'HOT';
                newScore = Math.min(currentState.score + 5, 100);
                break;

            case 'READY_TO_BUY':
                // Already at peak, maintain state
                newState = 'READY_TO_BUY';
                break;
        }

        return {
            leadId: currentState.leadId,
            state: newState,
            score: newScore,
            confidence: 0.8, // Default confidence for automated transitions
            lastUpdated: new Date(),
        };
    }

    private isHighValueSignal(eventType: string): boolean {
        const highValueSignals = ['PRICING_REQUESTED', 'DEMO_REQUESTED', 'CONTRACT_SENT'];
        return highValueSignals.includes(eventType);
    }
}
