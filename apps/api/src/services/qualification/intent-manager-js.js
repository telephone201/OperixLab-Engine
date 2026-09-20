/**
 * @file intent-manager-js.js
 */
class IntentManager {
    async processEvent(event, currentState) {
        let newState = currentState.state;
        let newScore = currentState.score;
        let newConfidence = currentState.confidence;

        if (event.eventType === 'READY_TO_BUY') {
            return {
                leadId: currentState.leadId,
                state: 'HOT',
                score: 100,
                confidence: 1.0,
                lastUpdated: new Date(),
            };
        }

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
                    newState = 'WARM';
                    newScore = Math.min(currentState.score + 10, 79);
                }
                break;
            case 'HOT':
                newState = 'HOT';
                newScore = Math.min(currentState.score + 5, 100);
                break;
            case 'READY_TO_BUY':
                newState = 'READY_TO_BUY';
                break;
        }

        return {
            leadId: currentState.leadId,
            state: newState,
            score: newScore,
            confidence: 0.8,
            lastUpdated: new Date(),
        };
    }

    isHighValueSignal(eventType) {
        const highValueSignals = ['PRICING_REQUESTED', 'DEMO_REQUESTED', 'CONTRACT_SENT'];
        return highValueSignals.includes(eventType);
    }
}

module.exports = { IntentManager };
