/**
 * @file handover-service.ts
 * @description Orchestrates the transition from Client Acceptance to Formal Handover and Support Activation.
 */

import { db } from '../../lib/db';
import {
    Handover,
    HandoverStatus,
    HandoverItem,
    HandoverItemCategory,
    HandoverItemStatus,
    SupportReadiness,
    SupportReadinessStatus,
    SupportMode,
    SupportTransition,
    SupportTransitionStatus
} from './handover-types';
import { ProjectStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';
import crypto from 'crypto';

export class HandoverService {
    /**
     * Initiates a handover process.
     * Precondition: Project must be ACCEPTED.
     */
    async initiateHandover(params: {
        projectId: string;
        acceptanceId: string;
        scopeBaselineId: string;
        deliveryPlanVersionId: string;
        solutionVersionId: string;
        workflowVersionId: string;
        userId: string;
    }): Promise<Handover> {
        const project = await db.projects.findUnique({ where: { id: params.projectId } });
        if (!project || project.status !== 'ACCEPTED') {
            throw new Error('HANDOVER_BLOCKED: Project must be in ACCEPTED status to begin handover.');
        }

        const handoverId = `ho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const handover = await db.handovers.create({
            data: {
                id: handoverId,
                project_id: params.projectId,
                acceptance_id: params.acceptanceId,
                scope_baseline_id: params.scopeBaselineId,
                delivery_plan_version_id: params.deliveryPlanVersionId,
                solution_version_id: params.solutionVersionId,
                workflow_version_id: params.workflowVersionId,
                handover_version: 1,
                status: HandoverStatus.DRAFT,
                created_by: params.userId,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'HANDOVER_CREATED',
            entityType: 'Handover',
            entityId: handoverId,
            details: { projectId: params.projectId }
        });

        return this.mapToDomain(handover);
    }

    /**
     * Generates a deterministic handover checklist based on the project scope and strategy.
     */
    async generateHandoverChecklist(handoverId: string): Promise<HandoverItem[]> {
        const handover = await db.handovers.findUnique({ where: { id: handoverId } });
        if (!handover) throw new Error('HANDOVER_NOT_FOUND');

        await db.transaction(async (client) => {
            await client.query(
                'INSERT INTO handover_items (id, handover_id, category, title, description, required, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6), (gen_random_uuid(), $1, $7, $8, $9, $5, $6), (gen_random_uuid(), $1, $10, $11, $12, $5, $6) ON CONFLICT (handover_id, category, title) DO NOTHING',
                [
                    handoverId,
                    HandoverItemCategory.DELIVERABLE,
                    'Accepted Scope Verified',
                    'Ensure all accepted scope items are physically delivered',
                    true,
                    HandoverItemStatus.PENDING,
                    HandoverItemCategory.DOCUMENTATION,
                    'Operational Manual Delivered',
                    'Provide client with operating instructions',
                    HandoverItemCategory.ACCESS,
                    'Credential Transfer',
                    'Hand over administrative access to client'
                ]
            );
        });

        const items = await db.handover_items.findMany({
            where: { handover_id: handoverId },
            orderBy: { created_at: 'asc' }
        });

        return items.map(i => this.mapToDomainItem(i));
    }

    async completeHandoverItem(itemId: string, userId: string, evidence?: string): Promise<void> {
        const now = new Date();

        await db.transaction(async (client) => {
            const result = await client.query(
                'UPDATE handover_items SET status = , completed_at = , evidence_reference =  WHERE id =  AND status <>  RETURNING id',
                [
                    HandoverItemStatus.COMPLETED,
                    now,
                    evidence,
                    itemId,
                    HandoverItemStatus.COMPLETED
                ]
            );

            if (result.rowCount !== 1) {
                const item = await db.handover_items.findUnique({ where: { id: itemId } });
                if (!item) {
                    throw new Error('HANDOVER_ITEM_NOT_FOUND');
                }
                throw new Error('HANDOVER_ITEM_CONFLICT: Item has already been completed or changed.');
            }
        });

        await auditLogger.log({
            action: 'HANDOVER_ITEM_COMPLETED',
            entityType: 'HandoverItem',
            entityId: itemId,
            details: { completedBy: userId }
        });
    }
    async approveHandover(handoverId: string, userId: string): Promise<void> {
        const now = new Date();

        let projectId = '';

        await db.transaction(async (client) => {
            const handoverResult = await client.query(
                `SELECT id, project_id, status
                 FROM handovers
                 WHERE id = $1
                 FOR UPDATE`,
                [handoverId]
            );

            if (handoverResult.rowCount !== 1) {
                throw new Error('HANDOVER_NOT_FOUND');
            }

            const handover = handoverResult.rows[0];

            if (handover.status === HandoverStatus.HANDED_OVER) {
                throw new Error('HANDOVER_CONFLICT: Handover has already been finalized.');
            }

            const incompleteResult = await client.query(
                `SELECT COUNT(*)::int AS count
                 FROM handover_items
                 WHERE handover_id = $1
                   AND required = TRUE
                   AND status <> $2`,
                [handoverId, HandoverItemStatus.COMPLETED]
            );

            const incomplete = incompleteResult.rows[0].count;

            if (incomplete > 0) {
                throw new Error(
                    'HANDOVER_BLOCKED: ' + incomplete + ' required items are still pending.'
                );
            }

            const updateResult = await client.query(
                `UPDATE handovers
                 SET status = $1,
                     approved_at = $2,
                     completed_at = $2,
                     updated_at = $2
                 WHERE id = $3
                   AND status <> $4
                 RETURNING project_id`,
                [
                    HandoverStatus.HANDED_OVER,
                    now,
                    handoverId,
                    HandoverStatus.HANDED_OVER
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('HANDOVER_CONFLICT: Handover has already been finalized or changed.');
            }

            projectId = updateResult.rows[0].project_id;

            const projectResult = await client.query(
                `UPDATE projects
                 SET status = $1
                 WHERE id = $2
                   AND status = $3
                 RETURNING id`,
                [
                    ProjectStatus.HANDED_OVER,
                    projectId,
                    ProjectStatus.ACCEPTED
                ]
            );

            if (projectResult.rowCount !== 1) {
                throw new Error('PROJECT_STATE_CONFLICT: Project is no longer in ACCEPTED state.');
            }
        });

        await auditLogger.log({
            action: 'HANDOVER_APPROVED',
            entityType: 'Handover',
            entityId: handoverId,
            details: {
                approvedBy: userId,
                projectId
            }
        });
    }
    /**
     * Establishes support readiness.
     */
    async establishSupportReadiness(params: {
        projectId: string;
        handoverId: string;
        supportMode: SupportMode;
        supportReference: string;
        knownLimitations: string;
        operationalRequirements: string;
        escalationReference: string;
        userId: string;
    }): Promise<SupportReadiness> {
        const readinessId = crypto.randomUUID();
        const now = new Date();

        const result = await db.query(
            `INSERT INTO support_readiness
                (id, project_id, handover_id, status, support_mode, support_reference,
                 known_limitations, operational_requirements, escalation_reference,
                 prepared_by, prepared_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (handover_id) DO NOTHING
             RETURNING *`,
            [
                readinessId,
                params.projectId,
                params.handoverId,
                SupportReadinessStatus.READY,
                params.supportMode,
                params.supportReference,
                params.knownLimitations,
                params.operationalRequirements,
                params.escalationReference,
                params.userId,
                now
            ]
        );

        if (result.rows.length === 1) {
            return this.mapToDomainReadiness(result.rows[0]);
        }

        const existing = await db.support_readiness.findUnique({
            where: { handover_id: params.handoverId }
        });

        if (!existing) {
            throw new Error('SUPPORT_READINESS_CONFLICT: Readiness could not be established.');
        }

        return this.mapToDomainReadiness(existing);
    }
    /**
     * Activates the support transition.
     */
    async activateSupport(params: {
        projectId: string;
        handoverId: string;
        supportReadinessId: string;
        userId: string;
    }): Promise<void> {
        const readiness = await db.support_readiness.findUnique({
            where: { id: params.supportReadinessId }
        });

        if (
            !readiness ||
            readiness.project_id !== params.projectId ||
            readiness.handover_id !== params.handoverId ||
            readiness.status !== SupportReadinessStatus.READY
        ) {
            throw new Error('SUPPORT_ACTIVATION_BLOCKED: Support readiness not established.');
        }

        const transitionId = crypto.randomUUID();
        const now = new Date();

        const result = await db.query(
            `INSERT INTO support_transitions
                (id, project_id, handover_id, support_readiness_id, status, transitioned_by, transitioned_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (handover_id, support_readiness_id) DO NOTHING
             RETURNING id`,
            [
                transitionId,
                params.projectId,
                params.handoverId,
                params.supportReadinessId,
                SupportTransitionStatus.COMPLETED,
                params.userId,
                now
            ]
        );

        if (result.rows.length === 0) {
            return;
        }

        await auditLogger.log({
            action: 'SUPPORT_ACTIVATED',
            entityType: 'SupportTransition',
            entityId: transitionId,
            details: { projectId: params.projectId }
        });
    }

    private mapToDomain(handover: any): Handover {
        return {
            handoverId: handover.id,
            projectId: handover.project_id,
            acceptanceId: handover.acceptance_id,
            scopeBaselineId: handover.scope_baseline_id,
            deliveryPlanVersionId: handover.delivery_plan_version_id,
            solutionVersionId: handover.solution_version_id,
            workflowVersionId: handover.workflow_version_id,
            handoverVersion: handover.handover_version,
            status: handover.status as HandoverStatus,
            createdBy: handover.created_by,
            createdAt: handover.created_at,
            updatedAt: handover.updated_at,
            preparedAt: handover.prepared_at,
            approvedAt: handover.approved_at,
            completedAt: handover.completed_at
        };
    }

    private mapToDomainItem(item: any): HandoverItem {
        return {
            handoverItemId: item.id,
            handoverId: item.handover_id,
            category: item.category as HandoverItemCategory,
            title: item.title,
            description: item.description,
            required: item.required,
            status: item.status as HandoverItemStatus,
            evidenceReference: item.evidence_reference,
            owner: item.owner,
            completedAt: item.completed_at,
            notes: item.notes
        };
    }

    private mapToDomainReadiness(sr: any): SupportReadiness {
        return {
            supportReadinessId: sr.id,
            projectId: sr.project_id,
            handoverId: sr.handover_id,
            status: sr.status as SupportReadinessStatus,
            supportMode: sr.support_mode as SupportMode,
            supportReference: sr.support_reference,
            knownLimitations: sr.known_limitations,
            operationalRequirements: sr.operational_requirements,
            escalationReference: sr.escalation_reference,
            preparedBy: sr.prepared_by,
            preparedAt: sr.prepared_at
        };
    }
}

export const handoverService = new HandoverService();
