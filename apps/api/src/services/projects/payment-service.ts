/**
 * @file payment-service.ts
 * @description Manages payment submissions and requirements derived from agreements.
 */

import { db } from '../../lib/db';
import { Payment, PaymentPurpose, PaymentReadinessStatus } from './payment-types';
import { PaymentStatus } from './types';
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
        const payment = await db.payments.update({
            where: { id: params.paymentId },
            data: {
                submitted_amount: params.submittedAmount,
                client_reference: params.clientReference,
                evidence_ref: params.evidenceRef,
                updated_at: new Date()
            }
        });

        // Note: status remains PENDING or moves to PENDING_VERIFICATION if that were a status
        // We keep it as PENDING until Human Verification happens.

        await auditLogger.log({
            action: 'PAYMENT_SUBMITTED',
            entityType: 'Payment',
            entityId: params.paymentId,
            details: { submittedAmount: params.submittedAmount }
        });

        await notifications.notify('PAYMENT_SUBMITTED', `Payment submission received for payment ${params.paymentId}.`, 'MEDIUM', params.paymentId);

        return this.mapToDomain(payment);
    }

    async getPaymentDestinations() {
        return this.provider.getPaymentDestinations();
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

