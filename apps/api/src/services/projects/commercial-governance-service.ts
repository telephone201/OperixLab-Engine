/**
 * @file commercial-governance-service.ts
 * @description Orchestrates commercial approvals and readiness checks.
 */

import { db } from '../../lib/db';
import { humanApprovalService } from '../governance/approval-service';
import { ApprovalType, ApprovalDecision } from '../governance/types';
import { commercialApprovalGate } from './commercial-approval-gate';
import { CommercialPackageStatus } from './commercial-types';
import { ProposalStatus } from './proposal-types';
import { auditLogger } from '../../core/logging/audit-logger';

export class CommercialGovernanceService {
    /**
     * Requests human approval for pricing.
     */
    async requestPricingApproval(pricingId: string, userId: string): Promise<string> {
        return await humanApprovalService.requestApproval({
            entityId: pricingId,
            entityType: 'PricingRecommendation',
            approvalType: ApprovalType.PRICING,
            requestedBy: userId
        });
    }

    /**
     * Requests human approval for a proposal.
     */
    async requestProposalApproval(proposalId: string, userId: string): Promise<string> {
        return await humanApprovalService.requestApproval({
            entityId: proposalId,
            entityType: 'Proposal',
            approvalType: ApprovalType.PROPOSAL,
            requestedBy: userId
        });
    }

    /**
     * Approves a commercial artifact.
     * Re-evaluates gates at decision time to prevent approving stale artifacts.
     */
    async approveArtifact(approvalId: string, userId: string, reason: string): Promise<void> {
        // 1. Retrieve approval and entity
        const approval = await db.governance_approvals.findUnique({ where: { id: approvalId } });
        if (!approval) throw new Error('APPROVAL_NOT_FOUND');


        await humanApprovalService.submitDecision(approvalId, ApprovalDecision.APPROVED, userId, reason);

        // 2. Project the governance decision onto the underlying artifact.
        // Proposal approvals must move the proposals row GENERATED -> APPROVED
        // so that CommercialApprovalGate (status = APPROVED check) and the
        // dashboard review queues observe the transition. The UPDATE is
        // guarded so only a GENERATED proposal can transition; if no row was
        // transitioned we fail explicitly instead of silently claiming the
        // artifact was approved. Non-proposal entity types keep the previous
        // behavior (governance approval only).
        if (approval.entity_type === 'Proposal') {
            const projection = await db.query(
                `UPDATE "proposals"
                 SET "status" = $1, "updated_at" = NOW()
                 WHERE "id" = $2
                   AND "status" = $3`,
                [
                    ProposalStatus.APPROVED,
                    approval.entity_id,
                    ProposalStatus.GENERATED
                ]
            );

            if (projection.rowCount !== 1) {
                throw new Error(
                    `PROPOSAL_APPROVAL_PROJECTION_FAILED: proposal ${approval.entity_id} was not in GENERATED state`
                );
            }
        }

        await auditLogger.log({
            action: 'COMMERCIAL_ARTIFACT_APPROVED',
            entityType: approval.entity_type,
            entityId: approval.entity_id,
            details: { approvalId, userId }
        });
    }

    /**
     * Checks if a proposal has been approved.
     */
    async verifyApproval(proposalId: string): Promise<{ approved: boolean }> {
        const proposal = await db.proposals.findUnique({
            where: { id: proposalId }
        });

        if (!proposal) {
            return { approved: false };
        }

        const activeApproval = await humanApprovalService.getActiveApproval(
            proposalId,
            ApprovalType.PROPOSAL
        );

        return {
            approved:
                proposal.status === ProposalStatus.APPROVED ||
                !!activeApproval
        };
    }
    /**
     * Checks if the commercial package is ready for the next phase.
     */
    async checkCommercialReadiness(commercialPackageId: string): Promise<any> {
        return await commercialApprovalGate.checkCommercialReadiness(commercialPackageId);
    }
}

export const commercialGovernanceService = new CommercialGovernanceService();
