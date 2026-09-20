/**
 * @file eligibility-gate.ts
 * @description Deterministic guard that prevents project activation without commercial verification.
 */

import { db } from '../lib/db';
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

        // 1. Commercial Gate: Payment must be verified
        // Integration with PaymentReadinessService for deterministic verification
        const readiness = await paymentReadinessService.evaluateReadiness(project.proposal_id);
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

        // 2. Contract Gate: Must be linked to a contract (implied by schema FK, but verified here)
        if (!project.contract_id) {
            return { eligible: false, reason: 'CONTRACT_BLOCK: Project must be linked to a valid contract.' };
        }

        return { eligible: true };
    }
}

export const projectStartEligibilityGate = new ProjectStartEligibilityGate();
