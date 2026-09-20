/**
 * @file project-service.ts
 * @description Service for managing the Project lifecycle and state transitions.
 */

import { db } from '../../lib/db';
import { ProjectStatus, Project, ProjectStateTransition, PaymentStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';

export class ProjectService {
    /**
     * Creates a new project from a contract.
     */
    async createProject(params: {
        contractId: string;
        name: string;
        userId: string;
    }): Promise<Project> {
        const project = await db.projects.create({
            data: {
                contract_id: params.contractId,
                name: params.name,
                status: 'READY_TO_START', // Initial DB state
                payment_status: 'REQUIRED'
            }
        });

        await auditLogger.log({
            action: 'PROJECT_CREATED',
            entityType: 'Project',
            entityId: project.id,
            details: { createdBy: params.userId }
        });

        return this.mapToDomain(project);
    }

    /**
     * Transitions project state with validation.
     */
    async transitionState(params: ProjectStateTransition): Promise<void> {
        const project = await db.projects.findUnique({ where: { id: params.projectId } });
        if (!project) throw new Error('PROJECT_NOT_FOUND');

        this.validateTransition(project.status as ProjectStatus, params.toState);

        await db.projects.update({
            where: { id: params.projectId },
            data: { status: params.toState }
        });

        await auditLogger.log({
            action: `PROJECT_STATE_TRANSITION_${params.toState}`,
            entityType: 'Project',
            entityId: params.projectId,
            details: { from: project.status, reason: params.reason, actor: params.actorId }
        });
    }

    private validateTransition(from: ProjectStatus, to: ProjectStatus) {
        const allowed: Record<string, ProjectStatus[]> = {
            [ProjectStatus.PENDING]: [ProjectStatus.STARTED, ProjectStatus.BLOCKED],
            [ProjectStatus.STARTED]: [ProjectStatus.IMPLEMENTING, ProjectStatus.BLOCKED],
            [ProjectStatus.IMPLEMENTING]: [ProjectStatus.REVIEW, ProjectStatus.BLOCKED],
            [ProjectStatus.REVIEW]: [ProjectStatus.ACCEPTED, ProjectStatus.IMPLEMENTING, ProjectStatus.BLOCKED],
            [ProjectStatus.ACCEPTED]: [ProjectStatus.HANDED_OVER, ProjectStatus.BLOCKED],
            [ProjectStatus.HANDED_OVER]: [ProjectStatus.COMPLETED, ProjectStatus.BLOCKED],
            [ProjectStatus.COMPLETED]: [ProjectStatus.ARCHIVED],
            [ProjectStatus.BLOCKED]: [ProjectStatus.STARTED, ProjectStatus.IMPLEMENTING, ProjectStatus.REVIEW]
        };

        // Note: Database uses 'READY_TO_START' as initial. Mapping to PENDING for logic.
        const effectiveFrom = (from as string) === 'READY_TO_START' ? ProjectStatus.PENDING : from;

        if (!allowed[effectiveFrom] || !allowed[effectiveFrom].includes(to)) {
            throw new Error(`INVALID_PROJECT_TRANSITION: Cannot move from ${effectiveFrom} to ${to}`);
        }
    }

    private mapToDomain(project: any): Project {
        return {
            id: project.id,
            contractId: project.contract_id,
            name: project.name,
            status: project.status as ProjectStatus,
            paymentStatus: project.payment_status as PaymentStatus,
            paymentVerifiedAt: project.payment_verified_at,
            startDate: project.start_date,
            endDate: project.end_date,
            createdAt: project.created_at
        };
    }

    async getProject(id: string): Promise<Project> {
        const project = await db.projects.findUnique({ where: { id } });
        if (!project) throw new Error('PROJECT_NOT_FOUND');
        return this.mapToDomain(project);
    }
}

export const projectService = new ProjectService();
