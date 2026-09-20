/**
 * @file cost-tracker.ts
 * @description Tracks API usage and provider costs for analytics and billing.
 */

export interface UsageEntry {
    providerId: string;
    endpoint: string;
    tokensUsed: number;
    requestsCount: number;
    cost: number;
    timestamp: Date;
}

export class CostTracker {
    async trackUsage(entry: Omit<UsageEntry, 'timestamp'>): Promise<void> {
        const fullEntry: UsageEntry = {
            ...entry,
            timestamp: new Date()
        };

        // In a real implementation, this would write to the api_usage table.
        console.log(`[COST] Provider: ${fullEntry.providerId} | Cost: ${fullEntry.cost} | Tokens: ${fullEntry.tokensUsed}`);
    }

    async trackProviderCost(providerId: string, amount: number, currency: string = 'USD'): Promise<void> {
        // In a real implementation, this would write to the provider_costs table.
        console.log(`[COST] Provider ${providerId} billed ${amount} ${currency}`);
    }
}

export const costTracker = new CostTracker();
