/**
 * @file eligibility-gate.ts
 * @description Deterministic guard that prevents project activation without commercial verification.
 */

import { db } from '../../lib/db';
import { ProjectStatus, PaymentStatus } from './types';
import { AgreementStatus } from './agreement-types';
import { paymentReadinessService } from './payment-readiness-service';

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
}

export class ProjectStartEligibilityGate {
    /**
     * Checks if a project is eligible to transition from PENDING/READY_TO_START to STARTED.
     */
    async checkEligibility(projectId: string): Promise<EligibilityResult> {
        const project = await db.projects.findUnique({ where: { id: projectId } });
        if (!project) {
            return { eligible: false, reason: 'PROJECT_NOT_FOUND' };
        }

        // 1. Contract Gate: The project must be linked to a valid contract.
        if (!project.contract_id) {
            return { eligible: false, reason: 'CONTRACT_BLOCK: Project must be linked to a valid contract.' };
        }

        const contract = await db.contracts.findUnique({
            where: { id: project.contract_id }
        });

        if (!contract) {
            return { eligible: false, reason: 'CONTRACT_BLOCK: Project contract was not found.' };
        }

        if (!contract.proposal_id) {
            return { eligible: false, reason: 'CONTRACT_BLOCK: Contract must be linked to a proposal.' };
        }

        // 2. Resolve the accepted commercial agreement explicitly.
        // A proposal may have multiple agreements, so readiness must use
        // the latest accepted agreement rather than guessing from proposal version.
        const proposalVersion = await db.proposal_versions.findFirst({
            where: { proposal_id: contract.proposal_id },
            orderBy: { version_number: 'desc' }
        });

        if (!proposalVersion) {
            return {
                eligible: false,
                reason: 'COMMERCIAL_BLOCK: No proposal version was found.'
            };
        }

        const agreement = await db.commercial_agreements.findFirst({
            where: {
                proposal_version_id: proposalVersion.id,
                status: AgreementStatus.ACCEPTED
            },
            orderBy: { created_at: 'desc' }
        });

        if (!agreement) {
            return {
                eligible: false,
                reason: 'COMMERCIAL_BLOCK: No accepted agreement was found.'
            };
        }

        // 3. Commercial Gate: Payment readiness must be VERIFIED
        // for this exact accepted agreement.
        const readiness = await paymentReadinessService.evaluateReadiness(
            agreement.id,
            contract.proposal_id
        );

        if (readiness.status !== 'VERIFIED') {
            return {
                eligible: false,
                reason: `COMMERCIAL_BLOCK: Payment readiness is ${readiness.status}, must be VERIFIED.`
            };
        }

        // 4. Project-level payment state must also be verified.
        if (project.payment_status !== PaymentStatus.VERIFIED) {
            return {
                eligible: false,
                reason: `COMMERCIAL_BLOCK: Project payment status is ${project.payment_status}, must be VERIFIED.`
            };
        }

        return { eligible: true };
    }
}

export const projectStartEligibilityGate = new ProjectStartEligibilityGate();