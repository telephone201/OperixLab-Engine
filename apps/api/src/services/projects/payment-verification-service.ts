/**
 * @file payment-verification-service.ts
 * @description Human-controlled service for verifying payments.
 * AI verification is explicitly forbidden.
 */

import { db } from '../../lib/db';
import { PaymentStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';
import { notifications } from '../../core/notifications/notification-system';

export class PaymentVerificationService {
    /**
     * Verifies a payment.
     * ONLY an authorized human can call this service.
     */
    async verifyPayment(params: {
        paymentId: string;
        verifiedAmount: number;
        verifiedBy: string; // Authorized Human User ID
        decision: 'VERIFY' | 'PARTIALLY_VERIFY' | 'REJECT';
        reason?: string;
    }): Promise<{ success: boolean; newStatus: PaymentStatus; proposalId: string }> {
        const payment = await db.payments.findUnique({ where: { id: params.paymentId } });
        if (!payment) throw new Error('PAYMENT_NOT_FOUND');

        let newStatus: PaymentStatus = PaymentStatus.REQUIRED;

        if (params.decision === 'VERIFY') {
            newStatus = PaymentStatus.VERIFIED;
        } else if (params.decision === 'PARTIALLY_VERIFY') {
            newStatus = PaymentStatus.PARTIAL;
        } else {
            newStatus = PaymentStatus.REQUIRED; // Or a dedicated REJECTED status if added
        }

        await db.payments.update({
            where: { id: params.paymentId },
            data: {
                verified_amount: params.verifiedAmount,
                status: newStatus,
                verified_by: params.verifiedBy,
                verified_at: new Date(),
                rejection_reason: params.reason || null
            }
        });

        await auditLogger.log({
            action: 'PAYMENT_VERIFIED',
            entityType: 'Payment',
            entityId: params.paymentId,
            details: {
                decision: params.decision,
                verifiedAmount: params.verifiedAmount,
                verifiedBy: params.verifiedBy
            }
        });

        await notifications.notify('PAYMENT_VERIFIED', `Payment ${params.paymentId} verified as ${newStatus}.`, 'HIGH', params.paymentId);

        return { success: true, newStatus, proposalId: payment.proposal_id };
    }
}

export const paymentVerificationService = new PaymentVerificationService();

