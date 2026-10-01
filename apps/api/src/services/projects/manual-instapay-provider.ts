/**
 * @file manual-instapay-provider.ts
 * @description Implementation of PaymentProvider for InstaPay.
 *
 * G1: payment destinations are configuration-driven. No personal payment
 * identifiers are embedded in source code. The provider fails clearly at
 * invocation time (not at process startup) when required identifiers are
 * missing, so environments that never invoke the manual payment provider
 * are not forced to configure it. Values are never logged.
 */

import { config } from '../../config/config-manager';
import { PaymentProvider } from './payment-provider';

export class ManualInstaPayProvider implements PaymentProvider {
    readonly providerId = 'MANUAL_INSTAPAY';

    async getPaymentDestinations(): Promise<{
        identifier: string;
        url: string;
        instructions?: string;
    }[]> {
        const primaryIdentifier = config.get('instapayPrimaryIdentifier');
        const primaryUrl = config.get('instapayPrimaryUrl');
        const secondaryIdentifier = config.get('instapaySecondaryIdentifier');
        const secondaryUrl = config.get('instapaySecondaryUrl');

        if (!primaryIdentifier || !primaryUrl) {
            throw new Error(
                'INSTAPAY_DESTINATION_MISSING: INSTAPAY_PRIMARY_IDENTIFIER and INSTAPAY_PRIMARY_URL are required when the manual payment provider is used.'
            );
        }

        const destinations: {
            identifier: string;
            url: string;
            instructions?: string;
        }[] = [
            {
                identifier: primaryIdentifier,
                url: primaryUrl,
                instructions: 'Primary payment destination for setup and recurring fees.'
            }
        ];

        if (secondaryIdentifier && secondaryUrl) {
            destinations.push({
                identifier: secondaryIdentifier,
                url: secondaryUrl,
                instructions: 'Secondary payment destination.'
            });
        }

        return destinations;
    }

    async calculateExpectedAmount(agreementId: string, purpose: string): Promise<number> {
        // In a real implementation, this would fetch the approved OfferOption
        // from the Agreement in the DB and calculate the amount.
        // For now, it's a placeholder as the AgreementService will handle the logic.
        return 0;
    }
}

export const manualInstaPayProvider = new ManualInstaPayProvider();
