/**
 * @file payment-provider.ts
 * @description Interface for Payment providers (InstaPay, Stripe, etc.)
 */

export interface PaymentProvider {
    readonly providerId: string;

    /**
     * Returns the payment destinations configured for this provider.
     */
    getPaymentDestinations(): Promise<{
        identifier: string;
        url: string;
        instructions?: string;
    }[]>;

    /**
     * Returns the expected amount for a specific payment purpose based on the agreement.
     */
    calculateExpectedAmount(agreementId: string, purpose: string): Promise<number>;
}
