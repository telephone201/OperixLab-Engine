/**
 * @file manual-instapay-provider.ts
 * @description Implementation of PaymentProvider for InstaPay.
 */

import { PaymentProvider } from './payment-provider';

export class ManualInstaPayProvider implements PaymentProvider {
    readonly providerId = 'MANUAL_INSTAPAY';

    async getPaymentDestinations(): Promise<{
        identifier: string;
        url: string;
        instructions?: string;
    }[]> {
        return [
            {
                identifier: 'mazenhegazy22@instapay',
                url: 'https://ipn.eg/S/mazenhegazy22/instapay/7Or03R',
                instructions: 'Primary payment destination for setup and recurring fees.'
            },
            {
                identifier: 'mazenhegazy21@instapay',
                url: 'https://ipn.eg/S/mazenhegazy21/instapay/7BHsiF',
                instructions: 'Secondary payment destination.'
            }
        ];
    }

    async calculateExpectedAmount(agreementId: string, purpose: string): Promise<number> {
        // In a real implementation, this would fetch the approved OfferOption
        // from the Agreement in the DB and calculate the amount.
        // For now, it's a placeholder as the AgreementService will handle the logic.
        return 0;
    }
}

export const manualInstaPayProvider = new ManualInstaPayProvider();
