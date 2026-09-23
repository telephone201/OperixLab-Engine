/**
 * @file payment-readiness-service.ts
 * @description Deterministically evaluates if commercial payment conditions are satisfied.
 */

import { db } from '../../lib/db';
import { PaymentReadiness, PaymentReadinessStatus } from './payment-types';
import { PaymentStatus } from './types';

export class PaymentReadinessService {
    /**
     * Evaluates payment readiness for a specific commercial agreement.
     *
     * The agreement is explicit because a proposal may have multiple
     * agreements over its lifecycle. Payments are scoped strictly to
     * the selected agreement and its proposal.
     */
    async evaluateReadiness(
        agreementId: string,
        proposalId: string
    ): Promise<PaymentReadiness> {
        const agreement = await db.commercial_agreements.findUnique({
            where: { id: agreementId }
        });

        if (!agreement) {
            throw new Error('AGREEMENT_NOT_FOUND');
        }

        const proposalVersion = await db.proposal_versions.findUnique({
            where: { id: agreement.proposal_version_id }
        });

        if (!proposalVersion || proposalVersion.proposal_id !== proposalId) {
            throw new Error('AGREEMENT_PROPOSAL_MISMATCH');
        }

        const payments = await db.payments.findMany({
            where: {
                agreement_id: agreementId,
                proposal_id: proposalId
            }
        });

        let totalRequired = 0;
        let totalVerified = 0;
        let allRequiredVerified = payments.length > 0;

        for (const payment of payments) {
            totalRequired += Number(payment.expected_amount || 0);
            totalVerified += Number(payment.verified_amount || 0);

            if (payment.status !== PaymentStatus.VERIFIED) {
                allRequiredVerified = false;
            }
        }

        const status =
            payments.length > 0 &&
            allRequiredVerified &&
            totalVerified >= totalRequired
                ? PaymentReadinessStatus.VERIFIED
                : PaymentReadinessStatus.NOT_READY;

        const now = new Date();

        const readiness: PaymentReadiness = {
            proposalId,
            agreementId,
            status,
            lastEvaluatedAt: now,
            verifiedAmountTotal: totalVerified,
            requiredAmountTotal: totalRequired,
            details: {
                paymentCount: payments.length,
                allVerified: allRequiredVerified
            }
        };

        await db.payment_readiness.upsert({
            where: { agreement_id: agreementId },
            update: {
                agreement_id: agreementId,
                status,
                last_evaluated_at: now,
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired,
                details: readiness.details
            },
            create: {
                proposal_id: proposalId,
                agreement_id: agreementId,
                status,
                last_evaluated_at: now,
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired,
                details: readiness.details
            }
        });

        return readiness;
    }
}

export const paymentReadinessService = new PaymentReadinessService();