/**
 * @file completion-eligibility-gate.ts
 * @description Deterministic gate to determine if a project is eligible for completion.
 */

import { db } from '../lib/db';
import { ProjectStatus } from './types';
import { CompletionStatus } from './completion-types';

export interface EligibilityResult {
    ready: boolean;
    status: CompletionStatus;
    blockingReasons: string[];
    warnings: string[];
}

export class CompletionEligibilityGate {
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
        const support = await db.support_transitions.findFirst({
            where: { project_id: projectId, status: 'COMPLETED' }
        });
        // Note: Support might be optional for some projects, but we assume required if defined in metadata.
        // Here we treat it as required if the project reached HANDED_OVER.
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
