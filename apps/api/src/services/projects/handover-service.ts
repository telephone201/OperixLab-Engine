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

        const items: any[] = [
            {
                id: `hi_${Date.now()}_1`,
                handover_id: handoverId,
                category: HandoverItemCategory.DELIVERABLE,
                title: 'Accepted Scope Verified',
                description: 'Ensure all accepted scope items are physically delivered',
                required: true,
                status: HandoverItemStatus.PENDING
            },
            {
                id: `hi_${Date.now()}_2`,
                handover_id: handoverId,
                category: HandoverItemCategory.DOCUMENTATION,
                title: 'Operational Manual Delivered',
                description: 'Provide client with operating instructions',
                required: true,
                status: HandoverItemStatus.PENDING
            },
            {
                id: `hi_${Date.now()}_3`,
                handover_id: handoverId,
                category: HandoverItemCategory.ACCESS,
                title: 'Credential Transfer',
                description: 'Hand over administrative access to client',
                required: true,
                status: HandoverItemStatus.PENDING
            }
        ];

        await db.handover_items.createMany({ data: items });

        return items.map(i => this.mapToDomain(i));
    }

    /**
     * Marks a handover item as complete.
     */
    async completeHandoverItem(itemId: string, userId: string, evidence?: string): Promise<void> {
        await db.handover_items.update({
            where: { id: itemId },
            data: {
                status: HandoverItemStatus.COMPLETED,
                completed_at: new Date(),
                evidence_reference: evidence
            }
        });

        await auditLogger.log({
            action: 'HANDOVER_ITEM_COMPLETED',
            entityType: 'HandoverItem',
            entityId: itemId,
            details: { completedBy: userId }
        });
    }

    /**
     * Approves the handover and transitions the project state.
     */
    async approveHandover(handoverId: string, userId: string): Promise<void> {
        const handover = await db.handovers.findUnique({ where: { id: handoverId } });
        if (!handover) throw new Error('HANDOVER_NOT_FOUND');

        // 1. Verify all required items are completed
        const incomplete = await db.handover_items.count({
            where: {
                handover_id: handoverId,
                required: true,
                status: { not: HandoverItemStatus.COMPLETED }
            }
        });

        if (incomplete > 0) {
            throw new Error(`HANDOVER_BLOCKED: ${incomplete} required items are still pending.`);
        }

        // 2. Update Handover Status
        await db.handovers.update({
            where: { id: handoverId },
            data: {
                status: HandoverStatus.HANDED_OVER,
                approved_at: new Date(),
                completed_at: new Date()
            }
        });

        // 3. Transition Project Status
        await db.projects.update({
            where: { id: handover.project_id },
            data: { status: 'HANDED_OVER' }
        });

        await auditLogger.log({
            action: 'HANDOVER_APPROVED',
            entityType: 'Handover',
            entityId: handoverId,
            details: { approvedBy: userId }
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
        const srId = `sr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const readiness = await db.support_readiness.create({
            data: {
                id: srId,
                project_id: params.projectId,
                handover_id: params.handoverId,
                status: SupportReadinessStatus.READY,
                support_mode: params.supportMode,
                support_reference: params.supportReference,
                known_limitations: params.knownLimitations,
                operational_requirements: params.operationalRequirements,
                escalation_reference: params.escalationReference,
                prepared_by: params.userId,
                prepared_at: new Date()
            }
        });

        return this.mapToDomain(readiness);
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
        const readiness = await db.support_readiness.findUnique({ where: { id: params.supportReadinessId } });
        if (!readiness || readiness.status !== SupportReadinessStatus.READY) {
            throw new Error('SUPPORT_ACTIVATION_BLOCKED: Support readiness not established.');
        }

        const transitionId = `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.support_transitions.create({
            data: {
                id: transitionId,
                project_id: params.projectId,
                handover_id: params.handoverId,
                support_readiness_id: params.supportReadinessId,
                status: SupportTransitionStatus.COMPLETED,
                transitioned_by: params.userId,
                transitioned_at: new Date()
            }
        });

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

