/**
 * @file agreement-service.ts
 * @description Orchestrates the Commercial Agreement lifecycle, enforcing approval gates and staleness.
 */

import { db } from '../../lib/db';
import {
    AgreementStatus,
    CommercialAgreement,
    AgreementFingerprint,
    AgreementAcceptanceRecord
} from './agreement-types';
import { AgreementProvider } from './agreement-provider';
import { manualAgreementProvider } from './manual-agreement-provider';
import { commercialApprovalGate } from './commercial-approval-gate';
import { auditLogger } from '../../core/logging/audit-logger';
import { notifications } from '../../core/notifications/notification-system';
import crypto from 'crypto';

export class AgreementService {
    private provider: AgreementProvider = manualAgreementProvider;

    /**
     * Creates a new Commercial Agreement from approved commercial state.
     * Enforces the Agreement Approval Gate.
     */
    async createAgreement(params: {
        commercialPackageId: string;
        offerOptionId: string;
        proposalVersionId: string;
        solutionVersionId: string;
        companyId: string;
        contactId?: string;
        createdBy: string;
    }): Promise<CommercialAgreement> {
        // 1. Agreement Approval Gate: Ensure source is approved and not stale
        const gateCheck = await commercialApprovalGate.checkApproval(params.proposalVersionId);
        if (!gateCheck.approved) {
            throw new Error(`AGREEMENT_BLOCKED: Proposal ${params.proposalVersionId} is not approved or is stale.`);
        }

        // 2. Generate material fingerprint
        const fingerprint = await this.calculateFingerprint(params);

        const agreement = await db.commercial_agreements.create({
            data: {
                commercial_package_id: params.commercialPackageId,
                offer_id: params.offerOptionId,
                proposal_version_id: params.proposalVersionId,
                solution_version_id: params.solutionVersionId,
                company_id: params.companyId,
                contact_id: params.contactId,
                status: AgreementStatus.DRAFT,
                fingerprint: fingerprint,
                created_by: params.createdBy,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'AGREEMENT_CREATED',
            entityType: 'CommercialAgreement',
            entityId: agreement.id,
            details: { status: AgreementStatus.DRAFT }
        });

        return this.mapToDomain(agreement);
    }

    async sendAgreement(agreementId: string, contactEmail: string): Promise<void> {
        const agreement = await db.commercial_agreements.findUnique({ where: { id: agreementId } });
        if (!agreement) throw new Error('AGREEMENT_NOT_FOUND');

        const result = await this.provider.sendAgreement(agreementId, contactEmail);
        if (!result.success) throw new Error('PROVIDER_SEND_FAILED');

        await db.commercial_agreements.update({
            where: { id: agreementId },
            data: { status: AgreementStatus.SENT, updated_at: new Date() }
        });

        await notifications.notify('AGREEMENT_SENT', `Commercial agreement ${agreementId} sent to ${contactEmail}`, 'MEDIUM', agreementId);
    }

    async recordAcceptance(params: {
        agreementId: string;
        actorId: string;
        actorType: 'CLIENT' | 'LEGAL_REPRESENTATIVE';
        evidence?: string;
    }): Promise<void> {
        const agreement = await db.commercial_agreements.findUnique({ where: { id: params.agreementId } });
        if (!agreement) throw new Error('AGREEMENT_NOT_FOUND');

        if (agreement.status === AgreementStatus.ACCEPTED) {
            throw new Error('AGREEMENT_ALREADY_ACCEPTED');
        }

        // Record immutable acceptance
        await db.commercial_agreement_acceptances.create({
            data: {
                agreement_id: params.agreementId,
                actor_id: params.actorId,
                actor_type: params.actorType,
                evidence_ref: params.evidence,
                timestamp: new Date()
            }
        });

        await db.commercial_agreements.update({
            where: { id: params.agreementId },
            data: {
                status: AgreementStatus.ACCEPTED,
                accepted_at: new Date(),
                accepted_by: params.actorId,
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'AGREEMENT_ACCEPTED',
            entityType: 'CommercialAgreement',
            entityId: params.agreementId,
            details: { actorId: params.actorId }
        });

        await notifications.notify('AGREEMENT_ACCEPTED', `Agreement ${params.agreementId} has been accepted by client.`, 'HIGH', params.agreementId);
    }

    async checkStaleness(agreementId: string): Promise<{ isStale: boolean; reason?: string }> {
        const agreement = await db.commercial_agreements.findUnique({ where: { id: agreementId } });
        if (!agreement) throw new Error('AGREEMENT_NOT_FOUND');

        const currentFingerprint = await this.calculateFingerprint({
            commercialPackageId: agreement.commercial_package_id,
            offerOptionId: agreement.offer_id,
            proposalVersionId: agreement.proposal_version_id,
            solutionVersionId: agreement.solution_version_id,
            companyId: agreement.company_id,
            createdBy: 'system'
        });

        if (agreement.fingerprint !== currentFingerprint) {
            return { isStale: true, reason: 'Material commercial terms have changed.' };
        }

        return { isStale: false };
    }

    private async calculateFingerprint(params: any): Promise<string> {
        // In real impl, this fetches PricingRecommendation and OfferOption
        // and hashes their material values (price, fees, scope, etc.)
        const materialTerms = {
            package: params.commercialPackageId,
            offer: params.offerOptionId,
            proposal: params.proposalVersionId,
            solution: params.solutionVersionId
        };
        return crypto.createHash('sha256').update(JSON.stringify(materialTerms)).digest('hex');
    }

    private mapToDomain(dbAgreement: any): CommercialAgreement {
        return {
            agreementId: dbAgreement.id,
            commercialPackageId: dbAgreement.commercial_package_id,
            offerOptionId: dbAgreement.offer_id,
            proposalVersionId: dbAgreement.proposal_version_id,
            solutionVersionId: dbAgreement.solution_version_id,
            companyId: dbAgreement.company_id,
            contactId: dbAgreement.contact_id,
            status: dbAgreement.status as AgreementStatus,
            fingerprint: dbAgreement.fingerprint,
            createdAt: dbAgreement.created_at,
            updatedAt: dbAgreement.updated_at,
            createdBy: dbAgreement.created_by,
            acceptedAt: dbAgreement.accepted_at,
            acceptedBy: dbAgreement.accepted_by,
            acceptedVia: dbAgreement.accepted_via
        };
    }
}

export const agreementService = new AgreementService();

