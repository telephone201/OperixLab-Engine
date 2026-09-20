/**
 * @file notification-rule-engine.ts
 * @description Deterministic trigger system that creates notifications based on state changes.
 */

import { IntentStateValue } from './intent-types';

export interface NotificationRule {
    id: string;
    name: string;
    triggerCondition: (oldState: IntentStateValue, newState: IntentStateValue) => boolean;
    action: string; // e.g., 'NOTIFY_OWNER', 'SEND_WELCOME_EMAIL'
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class NotificationRuleEngine {
    private rules: NotificationRule[] = [
        {
            id: 'rule_hot_intent',
            name: 'Hot Intent Notification',
            triggerCondition: (old, current) => old !== 'HOT' && current === 'HOT',
            action: 'NOTIFY_OWNER',
            priority: 'HIGH',
        },
        {
            id: 'rule_ready_to_buy',
            name: 'Ready to Buy Alert',
            triggerCondition: (old, current) => current === 'READY_TO_BUY',
            action: 'NOTIFY_OWNER',
            priority: 'HIGH',
        },
    ];

    /**
     * Evaluates current state changes against defined rules.
     * Returns a list of actions to be performed.
     */
    evaluate(oldState: IntentStateValue, newState: IntentStateValue): string[] {
        const triggeredActions: string[] = [];

        for (const rule of this.rules) {
            if (rule.triggerCondition(oldState, newState)) {
                triggeredActions.push(rule.action);
            }
        }

        return triggeredActions;
    }
}
