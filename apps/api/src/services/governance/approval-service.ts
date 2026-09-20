/**
 * @file approval-service.ts
 * @description Manages the request and decision lifecycle for human approvals.
 */

import { db } from '../../lib/db';
import { ApprovalType, ApprovalDecision, HumanApproval } from './types';

export class HumanApprovalService {
    /**
     * Requests a new human approval.
     */
    async requestApproval(params: {
        entityId: string;
        entityType: string;
        approvalType: ApprovalType;
        requestedBy: string;
        workflowVersionId?: string;
        artifactHash?: string;
        environment?: string;
        deploymentId?: string;
        expiryHours?: number;
    }): Promise<string> {
        const approvalId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const expiresAt = params.expiryHours
            ? new Date(Date.now() + params.expiryHours * 60 * 60 * 1000)
            : undefined;

        await db.governance_approvals.create({
            data: {
                id: approvalId,
                entity_id: params.entityId,
                entity_type: params.entityType,
                approval_type: params.approvalType,
                requested_by: params.requestedBy,
                requested_at: new Date(),
                status: ApprovalDecision.PENDING,
                workflow_version_id: params.workflowVersionId,
                artifact_hash: params.artifactHash,
                environment: params.environment,
                deployment_id: params.deploymentId,
                expires_at: expiresAt
            }
        });

        return approvalId;
    }

    /**
     * Grants or rejects an approval request.
     */
    async submitDecision(approvalId: string, decision: ApprovalDecision, userId: string, reason?: string): Promise<void> {
        const approval = await db.governance_approvals.findUnique({ where: { id: approvalId } });
        if (!approval) throw new Error('APPROVAL_NOT_FOUND');
        if (approval.status !== ApprovalDecision.PENDING) throw new Error('APPROVAL_ALREADY_DECIDED');

        await db.governance_approvals.update({
            where: { id: approvalId },
            data: {
                status: decision,
                decided_by: userId,
                decided_at: new Date(),
                reason: reason
            }
        });
    }

    /**
     * Retrieves the current approval state for a specific entity and type.
     */
    async getActiveApproval(entityId: string, type: ApprovalType): Promise<HumanApproval | null> {
        const approval = await db.governance_approvals.findFirst({
            where: {
                entity_id: entityId,
                approval_type: type,
                status: ApprovalDecision.APPROVED,
                OR: [
                    { expires_at: { equals: null } },
                    { expires_at: { gt: new Date() } }
                ]
            },
            orderBy: { created_at: 'desc' }
        });

        if (!approval) return null;

        return {
            approvalId: approval.id,
            entityType: approval.entity_type,
            entityId: approval.entity_id,
            approvalType: approval.approval_type as ApprovalType,
            requestedBy: approval.requested_by,
            requestedAt: approval.requested_at,
            decision: approval.status as ApprovalDecision,
            decidedBy: approval.decided_by,
            decidedAt: approval.decided_at,
            reason: approval.reason,
            expiresAt: approval.expires_at,
            workflowVersionId: approval.workflow_version_id,
            artifactHash: approval.artifact_hash,
            environment: approval.environment,
            deploymentId: approval.deployment_id
        };
    }
}

export const humanApprovalService = new HumanApprovalService();

