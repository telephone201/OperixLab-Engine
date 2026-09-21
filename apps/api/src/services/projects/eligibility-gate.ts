/**
 * @file eligibility-gate.ts
 * @description Deterministic guard that prevents project activation without commercial verification.
 */

import { db } from '../../lib/db';
import { ProjectStatus, PaymentStatus } from './types';
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

        // 2. Commercial Gate: Payment must be verified for the contract's proposal.
        const readiness = await paymentReadinessService.evaluateReadiness(contract.proposal_id);

        if (readiness.status !== 'VERIFIED') {
            return {
                eligible: false,
                reason: `COMMERCIAL_BLOCK: Payment readiness is ${readiness.status}, must be VERIFIED.`
            };
        }

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
