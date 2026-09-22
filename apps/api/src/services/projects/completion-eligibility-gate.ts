/**
 * @file completion-eligibility-gate.ts
 * @description Deterministic gate to determine if a project is eligible for completion.
 */

import { db } from '../../lib/db';
import { PoolClient } from 'pg';
import { ProjectStatus } from './types';
import { CompletionStatus } from './completion-types';

export interface EligibilityResult {
    ready: boolean;
    status: CompletionStatus;
    blockingReasons: string[];
    warnings: string[];
}

export class CompletionEligibilityGate {
    async evaluateWithClient(projectId: string, client: PoolClient): Promise<EligibilityResult> {
        const projectResult = await client.query(
            'SELECT id, status FROM projects WHERE id = $1',
            [projectId]
        );
        if (projectResult.rowCount !== 1) throw new Error('PROJECT_NOT_FOUND');

        const project = projectResult.rows[0];
        const blockingReasons: string[] = [];
        const warnings: string[] = [];

        if (project.status !== ProjectStatus.HANDED_OVER) {
            blockingReasons.push('PROJECT_NOT_HANDED_OVER');
        }

        const acceptanceResult = await client.query(
            `SELECT id, decision
             FROM acceptance_records
             WHERE project_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [projectId]
        );
        const acceptance = acceptanceResult.rows[0];

        if (!acceptance || acceptance.decision !== 'ACCEPTED') {
            blockingReasons.push('ACCEPTANCE_MISSING_OR_INVALID');
        }

        const handoverResult = await client.query(
            `SELECT id
             FROM handovers
             WHERE project_id = $1
               AND status = 'HANDED_OVER'
             ORDER BY completed_at DESC NULLS LAST
             LIMIT 1`,
            [projectId]
        );
        const handover = handoverResult.rows[0];

        if (!handover) {
            blockingReasons.push('HANDOVER_MISSING_OR_INCOMPLETE');
        }

        let support = null;

        if (handover) {
            const supportResult = await client.query(
                `SELECT id
                 FROM support_transitions
                 WHERE project_id = $1
                   AND handover_id = $2
                   AND status = 'COMPLETED'
                 ORDER BY transitioned_at DESC
                 LIMIT 1`,
                [projectId, handover.id]
            );
            support = supportResult.rows[0];
        }

        if (!support) {
            blockingReasons.push('SUPPORT_TRANSITION_MISSING');
        }

        const planResult = await client.query(
            `SELECT id
             FROM delivery_plans
             WHERE project_id = $1
               AND status = 'ACTIVE'
             LIMIT 1`,
            [projectId]
        );
        const activePlan = planResult.rows[0];

        if (activePlan) {
            const tasksResult = await client.query(
                `SELECT COUNT(*)::int AS count
                 FROM delivery_tasks
                 WHERE plan_id = $1
                   AND status <> 'COMPLETED'`,
                [activePlan.id]
            );

            if (Number(tasksResult.rows[0].count) > 0) {
                blockingReasons.push('DELIVERY_TASKS_INCOMPLETE');
            }
        }

        const crResult = await client.query(
            `SELECT COUNT(*)::int AS count
             FROM change_requests
             WHERE project_id = $1
               AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL')`,
            [projectId]
        );

        if (Number(crResult.rows[0].count) > 0) {
            blockingReasons.push('OPEN_MATERIAL_CHANGE_REQUESTS');
        }

        return {
            ready: blockingReasons.length === 0,
            status: blockingReasons.length === 0
                ? CompletionStatus.READY
                : CompletionStatus.BLOCKED,
            blockingReasons,
            warnings
        };
    }

    /**
     * Evaluates if a project is eligible for final completion.
     */
    async evaluate(projectId: string): Promise<EligibilityResult> {
        const project = await db.projects.findUnique({ where: { id: projectId } });
        if (!project) throw new Error('PROJECT_NOT_FOUND');

        const blockingReasons: string[] = [];
        const warnings: string[] = [];

        // 1. Project State Check: Must be HANDED_OVER
        if (project.status !== 'HANDED_OVER') {
            blockingReasons.push('PROJECT_NOT_HANDED_OVER');
        }

        // 2. Acceptance Check
        const acceptance = await db.acceptance_records.findFirst({
            where: { project_id: projectId },
            orderBy: { created_at: 'desc' }
        });
        if (!acceptance || acceptance.decision !== 'ACCEPTED') {
            blockingReasons.push('ACCEPTANCE_MISSING_OR_INVALID');
        }

        // 3. Handover Check
        const handover = await db.handovers.findFirst({
            where: {
                project_id: projectId,
                status: 'HANDED_OVER'
            },
            orderBy: { completed_at: 'desc' }
        });
        if (!handover) {
            blockingReasons.push('HANDOVER_MISSING_OR_INCOMPLETE');
        }

        // 4. Support Transition Check
        // Support must belong to the latest completed handover for this project.
        let support = null;

        if (handover) {
            support = await db.support_transitions.findFirst({
                where: {
                    project_id: projectId,
                    handover_id: handover.id,
                    status: 'COMPLETED'
                },
                orderBy: { transitioned_at: 'desc' }
            });
        }

        // Support is required once the project has reached HANDED_OVER.
        if (!support) {
            blockingReasons.push('SUPPORT_TRANSITION_MISSING');
        }

        // 5. Delivery Completion Check (Step 3)
        const activePlan = await db.delivery_plans.findFirst({
            where: { project_id: projectId, status: 'ACTIVE' }
        });
        if (activePlan) {
            const incompleteTasks = await db.delivery_tasks.count({
                where: {
                    plan_id: activePlan.id,
                    status: { not: 'COMPLETED' }
                }
            });
            if (incompleteTasks > 0) {
                blockingReasons.push('DELIVERY_TASKS_INCOMPLETE');
            }
        }

        // 6. Change Request Check (Step 4)
        const openCRs = await db.change_requests.count({
            where: {
                project_id: projectId,
                status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'] }
            }
        });
        if (openCRs > 0) {
            blockingReasons.push('OPEN_MATERIAL_CHANGE_REQUESTS');
        }

        if (blockingReasons.length > 0) {
            return {
                ready: false,
                status: CompletionStatus.BLOCKED,
                blockingReasons,
                warnings
            };
        }

        return {
            ready: true,
            status: CompletionStatus.READY,
            blockingReasons,
            warnings
        };
    }
}

export const completionEligibilityGate = new CompletionEligibilityGate();

