/**
 * @file agreement-provider.ts
 * @description Interface for Agreement providers (Manual, E-Signature, etc.)
 */

import { AgreementStatus } from './agreement-types';

export interface AgreementProvider {
    readonly providerId: string;

    /**
     * Prepares the agreement for acceptance (e.g., generating a link or sending a DocuSign envelope).
     */
    async sendAgreement(agreementId: string, contactEmail: string): Promise<{ success: boolean; externalRef?: string }>;

    /**
     * Checks the current status of an agreement from the provider's perspective.
     */
    async getAgreementStatus(agreementId: string): Promise<{ status: AgreementStatus; externalRef?: string }>;

    /**
     * Manually records an acceptance if the provider is the manual provider.
     */
    async recordAcceptance(agreementId: string, actorId: string, evidence?: string): Promise<{ success: boolean }>;

    /**
     * Voids an existing agreement.
     */
    async voidAgreement(agreementId: string): Promise<{ success: boolean }>;
}
