/**
 * @file notification-rule-engine-js.js
 */
class NotificationRuleEngine {
    constructor() {
        this.rules = [
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
    }

    evaluate(oldState, newState) {
        const triggeredActions = [];
        for (const rule of this.rules) {
            if (rule.triggerCondition(oldState, newState)) {
                triggeredActions.push(rule.action);
            }
        }
        return triggeredActions;
    }
}

module.exports = { NotificationRuleEngine };
