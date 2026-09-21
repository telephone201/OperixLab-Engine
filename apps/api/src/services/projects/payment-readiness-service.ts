/**
 * @file payment-readiness-service.ts
 * @description Deterministically evaluates if commercial payment conditions are satisfied.
 */

import { db } from '../../lib/db';
import { PaymentReadiness, PaymentReadinessStatus } from './payment-types';
import { PaymentStatus } from './types';

export class PaymentReadinessService {
    /**
     * Evaluates payment readiness for a proposal.
     * Readiness is VERIFIED only when at least one required payment exists,
     * every required payment is VERIFIED, and the verified total covers
     * the required total.
     */
    async evaluateReadiness(proposalId: string): Promise<PaymentReadiness> {
        const payments = await db.payments.findMany({
            where: { proposal_id: proposalId }
        });

        const proposalVersion = await db.proposal_versions.findFirst({
            where: { proposal_id: proposalId },
            orderBy: { version_number: 'desc' }
        });

        const agreement = proposalVersion
            ? await db.commercial_agreements.findFirst({
                where: { proposal_version_id: proposalVersion.id },
                orderBy: { created_at: 'desc' }
            })
            : null;

        let totalRequired = 0;
        let totalVerified = 0;
        let allRequiredVerified = payments.length > 0;

        for (const p of payments) {
            totalRequired += Number(p.expected_amount || 0);
            totalVerified += Number(p.verified_amount || 0);

            if (p.status !== PaymentStatus.VERIFIED) {
                allRequiredVerified = false;
            }
        }

        const status =
            payments.length > 0 &&
            allRequiredVerified &&
            totalVerified >= totalRequired
                ? PaymentReadinessStatus.VERIFIED
                : PaymentReadinessStatus.NOT_READY;

        const readiness: PaymentReadiness = {
            proposalId,
            agreementId: agreement?.id || 'unknown',
            status,
            lastEvaluatedAt: new Date(),
            verifiedAmountTotal: totalVerified,
            requiredAmountTotal: totalRequired,
            details: {
                paymentCount: payments.length,
                allVerified: allRequiredVerified
            }
        };

        await db.payment_readiness.upsert({
            where: { proposal_id: proposalId },
            update: {
                status,
                last_evaluated_at: new Date(),
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired
            },
            create: {
                proposal_id: proposalId,
                agreement_id: agreement?.id || 'unknown',
                status,
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired
            }
        });

        return readiness;
    }
}

export const paymentReadinessService = new PaymentReadinessService();
