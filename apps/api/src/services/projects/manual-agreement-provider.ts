/**
 * @file manual-agreement-provider.ts
 * @description Zero-cost implementation of AgreementProvider for manual acceptance tracking.
 */

import { AgreementProvider } from './agreement-provider';
import { AgreementStatus } from './agreement-types';

export class ManualAgreementProvider implements AgreementProvider {
    readonly providerId = 'MANUAL_AGREEMENT';

    async sendAgreement(agreementId: string, contactEmail: string): Promise<{ success: boolean; externalRef?: string }> {
        // For manual, we just mark it as sent in our system.
        console.log(`[ManualAgreementProvider] Agreement ${agreementId} marked as sent to ${contactEmail}`);
        return { success: true, externalRef: `manual-sent-${agreementId}` };
    }

    async getAgreementStatus(agreementId: string): Promise<{ status: AgreementStatus; externalRef?: string }> {
        // Manual provider doesn't track state externally; status is managed in our DB.
        // We return DRAFT or a generic status that the service then overrides with DB state.
        return { status: AgreementStatus.DRAFT };
    }

    async recordAcceptance(agreementId: string, actorId: string, evidence?: string): Promise<{ success: boolean }> {
        console.log(`[ManualAgreementProvider] Recording manual acceptance for ${agreementId} by ${actorId}. Evidence: ${evidence}`);
        return { success: true };
    }

    async voidAgreement(agreementId: string): Promise<{ success: boolean }> {
        console.log(`[ManualAgreementProvider] Voiding agreement ${agreementId}`);
        return { success: true };
    }
}

export const manualAgreementProvider = new ManualAgreementProvider();
