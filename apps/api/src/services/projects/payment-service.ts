/**
 * @file payment-service.ts
 * @description Manages payment submissions and requirements derived from agreements.
 */

import { db } from '../../lib/db';
import { Payment, PaymentPurpose } from './payment-types';
import { PaymentStatus } from './types';
import { AgreementStatus } from './agreement-types';
import { manualInstaPayProvider } from './manual-instapay-provider';
import { auditLogger } from '../../core/logging/audit-logger';
import { notifications } from '../../core/notifications/notification-system';

export class PaymentService {
    private provider = manualInstaPayProvider;

    /**
     * Creates a payment requirement based on the approved offer in the agreement.
     */
    async createPaymentRequirement(params: {
        agreementId: string;
        proposalId: string;
        offerOptionId: string;
        purpose: PaymentPurpose;
        expectedAmount: number;
        currency: string;
    }): Promise<Payment> {
        const payment = await db.payments.create({
            data: {
                agreement_id: params.agreementId,
                proposal_id: params.proposalId,
                offer_id: params.offerOptionId,
                expected_amount: params.expectedAmount,
                currency: params.currency,
                purpose: params.purpose,
                status: PaymentStatus.REQUIRED,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'PAYMENT_REQUIREMENT_CREATED',
            entityType: 'Payment',
            entityId: payment.id,
            details: { amount: params.expectedAmount, purpose: params.purpose }
        });

        return this.mapToDomain(payment);
    }

    /**
     * Records a client payment submission.
     * This does NOT verify the payment.
     */
    async submitPayment(params: {
        paymentId: string;
        submittedAmount: number;
        clientReference: string;
        evidenceRef?: string;
    }): Promise<Payment> {
        const existingPayment = await db.payments.findUnique({
            where: { id: params.paymentId }
        });

        if (!existingPayment) throw new Error('PAYMENT_NOT_FOUND');
        const payment = await db.payments.update({
            where: { id: params.paymentId },
            data: {
                submitted_amount: params.submittedAmount,
                client_reference: params.clientReference,
                evidence_ref: params.evidenceRef,
                updated_at: new Date()
            }
        });

        // Note: submission does not change the payment status.
        // The payment remains REQUIRED until Human Verification changes it to VERIFIED or PARTIAL.

        await auditLogger.log({
            action: 'PAYMENT_SUBMITTED',
            entityType: 'Payment',
            entityId: params.paymentId,
            details: { submittedAmount: params.submittedAmount }
        });

        await notifications.notify('PAYMENT_SUBMITTED', `Payment submission received for payment ${params.paymentId}.`, 'MEDIUM', params.paymentId);

        return this.mapToDomain(payment);
    }

    /**
     * Returns payments that require human review.
     * Only submitted, non-verified payments are included.
     */
    async getPendingReviews(): Promise<Payment[]> {
        const payments = await db.payments.findMany({
            where: {
                OR: [
                    {
                        status: PaymentStatus.REQUIRED,
                        submitted_amount: { not: null }
                    },
                    {
                        status: PaymentStatus.PARTIAL
                    }
                ]
            },
            orderBy: { created_at: 'desc' }
        });

        return payments.map((payment) => this.mapToDomain(payment));
    }
    async getPaymentDestinations() {
        return this.provider.getPaymentDestinations();
    }

    /**
     * Milestone 3 Step 1: ensures exactly one SETUP_FEE payment requirement
     * exists for the accepted agreement of a proposal.
     *
     * Idempotent by design (application-level, no schema change):
     * if a SETUP_FEE payment already exists for the accepted agreement it is
     * reused, otherwise exactly one is created through the existing
     * createPaymentRequirement path (audit included).
     *
     * Source of truth for the amount: the approved offer's setup_fee and
     * currency (offer_options of the agreement's offer_id) — the same
     * convention the commercial model and the Step 8 verification use.
     *
     * Returns created=false with payment=null when no ACCEPTED agreement
     * exists yet for the proposal (nothing to do, not an error).
     */
    async ensureSetupFeeRequirementForProposal(params: {
        proposalId: string;
    }): Promise<{ created: boolean; payment: Payment | null }> {
        // 1. Resolve the accepted agreement for this proposal. The join scopes
        // it strictly: the agreement's proposal_version must belong to this
        // exact proposal.
        const agreementResult = await db.query(
            `SELECT ca.id, ca.offer_id
             FROM commercial_agreements ca
             JOIN proposal_versions pv ON pv.id = ca.proposal_version_id
             WHERE pv.proposal_id = $1
               AND ca.status = $2
             ORDER BY ca.created_at DESC
             LIMIT 1`,
            [params.proposalId, AgreementStatus.ACCEPTED]
        );

        const agreement = agreementResult.rows[0];

        if (!agreement) {
            return { created: false, payment: null };
        }

        // 2. Idempotency: reuse an existing SETUP_FEE payment for this
        // agreement instead of creating a duplicate.
        const existingResult = await db.query(
            `SELECT * FROM payments
             WHERE agreement_id = $1 AND purpose = $2
             LIMIT 1`,
            [agreement.id, PaymentPurpose.SETUP_FEE]
        );

        if (existingResult.rows[0]) {
            return { created: false, payment: this.mapToDomain(existingResult.rows[0]) };
        }

        // 3. Approved setup pricing from the agreement's offer. Never invent
        // fallback pricing: a missing/invalid setup fee is a hard error.
        const offerResult = await db.query(
            `SELECT setup_fee, currency FROM offer_options WHERE id = $1`,
            [agreement.offer_id]
        );

        const offer = offerResult.rows[0];

        if (!offer || offer.setup_fee === null || Number(offer.setup_fee) <= 0) {
            throw new Error('SETUP_FEE_PRICING_MISSING');
        }

        // 4. Create through the existing requirement-creation path.
        try {
            const payment = await this.createPaymentRequirement({
                agreementId: String(agreement.id),
                proposalId: params.proposalId,
                offerOptionId: String(agreement.offer_id),
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: Number(offer.setup_fee),
                currency: String(offer.currency)
            });

            return { created: true, payment };
        } catch (error: any) {
            if (error?.code !== '23505') {
                throw error;
            }

            const concurrentPaymentResult = await db.query(
                `SELECT * FROM payments
                 WHERE agreement_id = $1 AND purpose = $2
                 LIMIT 1`,
                [agreement.id, PaymentPurpose.SETUP_FEE]
            );

            if (concurrentPaymentResult.rows[0]) {
                return {
                    created: false,
                    payment: this.mapToDomain(concurrentPaymentResult.rows[0])
                };
            }

            throw error;
        }
    }

    private mapToDomain(dbPayment: any): Payment {
        return {
            paymentId: dbPayment.id,
            agreementId: dbPayment.agreement_id,
            proposalId: dbPayment.proposal_id,
            offerOptionId: dbPayment.offer_id,
            expectedAmount: dbPayment.expected_amount,
            verifiedAmount: dbPayment.verified_amount || 0,
            currency: dbPayment.currency,
            purpose: dbPayment.purpose as PaymentPurpose,
            status: dbPayment.status as PaymentStatus,
            submittedAmount: dbPayment.submitted_amount,
            clientReference: dbPayment.client_reference,
            evidenceReference: dbPayment.evidence_ref,
            verifiedBy: dbPayment.verified_by,
            verifiedAt: dbPayment.verified_at,
            rejectionReason: dbPayment.rejection_reason,
            createdAt: dbPayment.created_at,
            updatedAt: dbPayment.updated_at
        };
    }
}

export const paymentService = new PaymentService();
