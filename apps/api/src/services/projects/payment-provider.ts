/**
 * @file payment-provider.ts
 * @description Interface for Payment providers (InstaPay, Stripe, etc.)
 */

export interface PaymentProvider {
    readonly providerId: string;

    /**
     * Returns the payment destinations configured for this provider.
     */
    async getPaymentDestinations(): Promise<{
        identifier: string;
        url: string;
        instructions?: string;
    }[]>;

    /**
     * Returns the expected amount for a specific payment purpose based on the agreement.
     */
    async calculateExpectedAmount(agreementId: string, purpose: string): Promise<number>;
}
