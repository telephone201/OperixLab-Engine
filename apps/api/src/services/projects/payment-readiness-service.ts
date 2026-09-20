/**
 * @file payment-readiness-service.ts
 * @description Deterministically evaluates if commercial payment conditions are satisfied.
 */

import { db } from '../lib/db';
import { PaymentReadiness, PaymentReadinessStatus } from './payment-types';
import { PaymentStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';

export class PaymentReadinessService {
    /**
     * Evaluates payment readiness for a proposal.
     * Readiness is READY only if required payments are VERIFIED.
     */
    async evaluateReadiness(proposalId: string): Promise<PaymentReadiness> {
        const payments = await db.payments.findMany({
            where: { proposal_id: proposalId }
        });

        const agreement = await db.commercial_agreements.findFirst({
            where: {
                // Logic to find the active agreement for this proposal
            }
        });

        let totalRequired = 0;
        let totalVerified = 0;
        let allRequiredVerified = true;

        for (const p of payments) {
            totalRequired += p.expected_amount;
            totalVerified += p.verified_amount || 0;
            if (p.status !== PaymentStatus.VERIFIED) {
                allRequiredVerified = false;
            }
        }

        const status = allRequiredVerified && totalVerified >= totalRequired
            ? PaymentReadinessStatus.VERIFIED
            : PaymentReadinessStatus.NOT_READY;

        const readiness: PaymentReadiness = {
            proposalId,
            agreementId: agreement?.id || 'unknown',
            status: status,
            lastEvaluatedAt: new Date(),
            verifiedAmountTotal: totalVerified,
            requiredAmountTotal: totalRequired,
            details: {
                paymentCount: payments.length,
                allVerified: allRequiredVerified
            }
        };

        // Persist readiness state
        await db.payment_readiness.upsert({
            where: { proposal_id: proposalId },
            update: {
                status: status,
                last_evaluated_at: new Date(),
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired
            },
            create: {
                proposal_id: proposalId,
                agreement_id: agreement?.id || 'unknown',
                status: status,
                verified_amount_total: totalVerified,
                required_amount_total: totalRequired
            }
        });

        return readiness;
    }
}

export const paymentReadinessService = new PaymentReadinessService();
