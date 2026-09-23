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
        const proposalVersion = await db.proposal_versions.findUnique({ where: { id: params.proposalVersionId } });
        if (!proposalVersion || !proposalVersion.proposal_id) { throw new Error('AGREEMENT_BLOCKED: Proposal version was not found or is not linked to a proposal.'); }
        const gateCheck = await commercialApprovalGate.isArtifactAuthorized(proposalVersion.proposal_id, 'PROPOSAL');
        if (!gateCheck.authorized) {
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
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'AGREEMENT_CREATED',
            entityType: 'CommercialAgreement',
            entityId: agreement.id,
            details: { status: AgreementStatus.DRAFT, createdBy: params.createdBy }
        });

        return this.mapToDomain(agreement, params.createdBy);
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
        await db.transaction(async (tx) => {
            const agreementResult = await tx.query(
                `SELECT id, status
                 FROM commercial_agreements
                 WHERE id = $1
                 FOR UPDATE`,
                [params.agreementId]
            );

            if (agreementResult.rowCount !== 1) {
                throw new Error('AGREEMENT_NOT_FOUND');
            }

            const agreement = agreementResult.rows[0];

            if (agreement.status === AgreementStatus.ACCEPTED) {
                throw new Error('AGREEMENT_ALREADY_ACCEPTED');
            }

            const now = new Date();

            await tx.query(
                `INSERT INTO commercial_agreement_acceptances
                    (agreement_id, actor_id, actor_type, evidence_ref, timestamp)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    params.agreementId,
                    params.actorId,
                    params.actorType,
                    params.evidence || null,
                    now
                ]
            );

            const updateResult = await tx.query(
                `UPDATE commercial_agreements
                 SET status = $1,
                     accepted_at = $2,
                     accepted_by = $3,
                     updated_at = $2
                 WHERE id = $4
                   AND status <> $1`,
                [
                    AgreementStatus.ACCEPTED,
                    now,
                    params.actorId,
                    params.agreementId
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('AGREEMENT_ACCEPTANCE_UPDATE_FAILED');
            }
        });

        await auditLogger.log({
            action: 'AGREEMENT_ACCEPTED',
            entityType: 'CommercialAgreement',
            entityId: params.agreementId,
            details: { actorId: params.actorId }
        });

        await notifications.notify(
            'AGREEMENT_ACCEPTED',
            `Agreement ${params.agreementId} has been accepted by client.`,
            'HIGH',
            params.agreementId
        );
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

    private mapToDomain(dbAgreement: any, createdBy: string): CommercialAgreement {
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
            createdBy,
            acceptedAt: dbAgreement.accepted_at,
            acceptedBy: dbAgreement.accepted_by,
            acceptedVia: dbAgreement.accepted_via
        };
    }
}

export const agreementService = new AgreementService();

