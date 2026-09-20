/**
 * @file commercial-approval-gate.ts
 * @description Deterministic gate to verify commercial readiness and authorization.
 */

import { db } from '../lib/db';
import { approvalGate } from '../governance/approval-gate';
import { ApprovalType } from '../governance/types';
import { CommercialPackageStatus } from './commercial-types';
import { ProposalStatus } from './proposal-types';
import { commercialStalenessService } from './commercial-staleness-service';

export interface CommercialReadinessResult {
    isReady: boolean;
    status: string;
    blockingReasons: string[];
    isStale: boolean;
    stalenessReasons: string[];
}

export class CommercialApprovalGate {
    /**
     * Verifies if a commercial package is ready for engagement/agreement.
     */
    async checkCommercialReadiness(commercialPackageId: string): Promise<CommercialReadinessResult> {
        const pkg = await db.commercial_packages.findUnique({ where: { id: commercialPackageId } });
        if (!pkg) throw new Error('COMMERCIAL_PACKAGE_NOT_FOUND');

        const blockingReasons: string[] = [];
        const stalenessReasons: string[] = [];

        // 1. Basic Status Check
        if (pkg.status !== 'ACCEPTED' && pkg.status !== 'OFFER_READY') {
            blockingReasons.push(`INVALID_PACKAGE_STATUS: ${pkg.status}`);
        }

        // 2. Staleness Check
        const staleness = await commercialStalenessService.evaluatePackageStaleness(commercialPackageId);
        if (staleness.isStale) {
            stalenessReasons.push(...staleness.reasons);
        }

        // 3. Proposal Check
        const proposal = await db.proposals.findFirst({
            where: { commercial_package_id: commercialPackageId, status: ProposalStatus.APPROVED }
        });
        if (!proposal) {
            blockingReasons.push('NO_APPROVED_PROPOSAL');
        }

        const isReady = blockingReasons.length === 0 && !staleness.isStale;

        return {
            isReady,
            status: isReady ? 'READY_FOR_ENGAGEMENT' : 'NOT_READY',
            blockingReasons,
            isStale: staleness.isStale,
            stalenessReasons: stalenessReasons
        };
    }

    /**
     * Verifies if a specific artifact (Pricing or Proposal) is authorized for use.
     */
    async isArtifactAuthorized(entityId: string, type: 'PRICING' | 'PROPOSAL'): { authorized: boolean, reason?: string } {
        const approvalType = type === 'PRICING' ? ApprovalType.PRICING : ApprovalType.PROPOSAL;

        return await approvalGate.isAuthorized(entityId, approvalType, {});
    }
}

export const commercialApprovalGate = new CommercialApprovalGate();
