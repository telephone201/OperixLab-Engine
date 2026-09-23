/**
 * @file approval-service.ts
 * @description Manages the request and decision lifecycle for human approvals.
 */

import crypto from 'crypto';
import { PoolClient } from 'pg';
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
        const approvalId = crypto.randomUUID();

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
     * Creates an approval request inside an existing PostgreSQL transaction.
     */
    async requestApprovalWithClient(
        client: PoolClient,
        params: {
            entityId: string;
            entityType: string;
            approvalType: ApprovalType;
            requestedBy: string;
            workflowVersionId?: string;
            artifactHash?: string;
            environment?: string;
            deploymentId?: string;
            expiryHours?: number;
        }
    ): Promise<string> {
        const approvalId = crypto.randomUUID();

        const expiresAt = params.expiryHours
            ? new Date(Date.now() + params.expiryHours * 60 * 60 * 1000)
            : null;

        await client.query(
            `INSERT INTO governance_approvals
                (id, entity_id, entity_type, approval_type, requested_by,
                 requested_at, status, workflow_version_id, artifact_hash,
                 environment, deployment_id, expires_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                approvalId,
                params.entityId,
                params.entityType,
                params.approvalType,
                params.requestedBy,
                new Date(),
                ApprovalDecision.PENDING,
                params.workflowVersionId ?? null,
                params.artifactHash ?? null,
                params.environment ?? null,
                params.deploymentId ?? null,
                expiresAt
            ]
        );

        return approvalId;
    }

async submitDecision(approvalId: string, decision: ApprovalDecision, userId: string, reason?: string): Promise<void> {
        const approval = await db.governance_approvals.findUnique({ where: { id: approvalId } });
        if (!approval) throw new Error('APPROVAL_NOT_FOUND');

        if (approval.status !== ApprovalDecision.PENDING) {
            throw new Error('APPROVAL_ALREADY_DECIDED');
        }

        const decidedAt = new Date();

        const updateResult = await db.query(
            `UPDATE governance_approvals
             SET status = $1,
                 decided_by = $2,
                 decided_at = $3,
                 reason = $4
             WHERE id = $5
               AND status = $6`,
            [
                decision,
                userId,
                decidedAt,
                reason || null,
                approvalId,
                ApprovalDecision.PENDING
            ]
        );

        if (updateResult.rowCount !== 1) {
            throw new Error('APPROVAL_ALREADY_DECIDED');
        }
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
    /**
     * Reads the latest non-expired approved approval inside an existing transaction.
     */
    async getActiveApprovalWithClient(
        client: PoolClient,
        entityId: string,
        type: ApprovalType
    ): Promise<HumanApproval | null> {
        const result = await client.query(
            `SELECT *
             FROM governance_approvals
             WHERE entity_id = $1
               AND approval_type = $2
               AND status = $3
               AND (expires_at IS NULL OR expires_at > $4)
             ORDER BY created_at DESC
             LIMIT 1`,
            [
                entityId,
                type,
                ApprovalDecision.APPROVED,
                new Date()
            ]
        );

        if (result.rowCount !== 1) {
            return null;
        }

        const approval = result.rows[0];

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
