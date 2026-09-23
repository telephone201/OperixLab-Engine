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
     *
     * The payment row is locked for the duration of the decision so
     * concurrent verification requests cannot overwrite each other
     * without serialization.
     */
    async verifyPayment(params: {
        paymentId: string;
        verifiedAmount: number;
        verifiedBy: string;
        decision: 'VERIFY' | 'PARTIALLY_VERIFY' | 'REJECT';
        reason?: string;
    }): Promise<{
        success: boolean;
        newStatus: PaymentStatus;
        proposalId: string;
        agreementId: string;
    }> {
        const result = await db.transaction(async (tx) => {
            const paymentResult = await tx.query(
                `SELECT id, proposal_id, agreement_id, expected_amount, status
                 FROM payments
                 WHERE id = $1
                 FOR UPDATE`,
                [params.paymentId]
            );

            if (paymentResult.rowCount !== 1) {
                throw new Error('PAYMENT_NOT_FOUND');
            }

            const payment = paymentResult.rows[0];

            if (
                payment.status === PaymentStatus.VERIFIED &&
                params.decision !== 'VERIFY'
            ) {
                throw new Error(
                    'PAYMENT_STATE_CONFLICT: Verified payment cannot be downgraded'
                );
            }

            let newStatus: PaymentStatus;

            if (params.decision === 'VERIFY') {
                newStatus = PaymentStatus.VERIFIED;
            } else if (params.decision === 'PARTIALLY_VERIFY') {
                newStatus = PaymentStatus.PARTIAL;
            } else {
                newStatus = PaymentStatus.REQUIRED;
            }

            const now = new Date();

            const updateResult = await tx.query(
                `UPDATE payments
                 SET verified_amount = $1,
                     status = $2,
                     verified_by = $3,
                     verified_at = $4,
                     rejection_reason = $5,
                     updated_at = $4
                 WHERE id = $6
                 RETURNING id, proposal_id, agreement_id, status`,
                [
                    params.verifiedAmount,
                    newStatus,
                    params.verifiedBy,
                    now,
                    params.reason || null,
                    params.paymentId
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('PAYMENT_VERIFICATION_FAILED');
            }

            return {
                paymentId: params.paymentId,
                proposalId: payment.proposal_id,
                agreementId: payment.agreement_id,
                newStatus
            };
        });

        await auditLogger.log({
            action: 'PAYMENT_VERIFIED',
            entityType: 'Payment',
            entityId: result.paymentId,
            details: {
                decision: params.decision,
                verifiedAmount: params.verifiedAmount,
                verifiedBy: params.verifiedBy
            }
        });

        await notifications.notify(
            'PAYMENT_VERIFIED',
            `Payment ${result.paymentId} verified as ${result.newStatus}.`,
            'HIGH',
            result.paymentId
        );

        return {
            success: true,
            newStatus: result.newStatus,
            proposalId: result.proposalId,
            agreementId: result.agreementId
        };
    }
}

export const paymentVerificationService = new PaymentVerificationService();