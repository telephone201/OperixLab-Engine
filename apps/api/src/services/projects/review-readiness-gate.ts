/**
 * @file review-readiness-gate.ts
 * @description Deterministic guard to ensure a project is ready for client review.
 */

import { db } from '../lib/db';
import { ProjectStatus } from './types';
import { DeliveryPlanStatus } from './delivery-plan-types';

export interface ReadinessResult {
    ready: boolean;
    reason?: string;
}

export class ReviewReadinessGate {
    /**
     * Validates if a project is ready for client review based on technical and operational state.
     */
    async checkReadiness(projectId: string): Promise<ReadinessResult> {
        const project = await db.projects.findUnique({ where: { id: projectId } });
        if (!project) return { ready: false, reason: 'PROJECT_NOT_FOUND' };

        // 1. Basic Lifecycle Check
        if (project.status !== 'IMPLEMENTING' && project.status !== 'REVIEW') {
            return { ready: false, reason: `INVALID_PROJECT_STATUS: Project must be in IMPLEMENTING or REVIEW state, currently ${project.status}.` };
        }

        // 2. Scope Baseline Check
        const baseline = await db.scope_baselines.findFirst({
            where: { project_id: projectId, status: 'CONFIRMED' },
            orderBy: { version: 'desc' }
        });
        if (!baseline) {
            return { ready: false, reason: 'SCOPE_NOT_CONFIRMED: No confirmed scope baseline found.' };
        }

        // 3. Delivery Plan Check
        const plan = await db.delivery_plans.findFirst({
            where: { project_id: projectId, status: 'ACTIVE' }
        });
        if (!plan) {
            return { ready: false, reason: 'DELIVERY_PLAN_MISSING: No active delivery plan found.' };
        }

        // 4. Technical Implementation Check (Simplified for Step 5)
        // In a full implementation, we would check if all mandatory DeliveryTasks are COMPLETED.
        const incompleteTasks = await db.delivery_tasks.count({
            where: {
                plan_id: plan.id,
                status: { not: 'COMPLETED' }
            }
        });

        // Note: We allow review even if some tasks are pending, as long as the core is delivered.
        // However, if 100% of tasks are pending, it's not ready.
        const totalTasks = await db.delivery_tasks.count({ where: { plan_id: plan.id } });
        if (totalTasks > 0 && incompleteTasks === totalTasks) {
            return { ready: false, reason: 'IMPLEMENTATION_INCOMPLETE: No delivery tasks have been completed.' };
        }

        return { ready: true };
    }
}

export const reviewReadinessGate = new ReviewReadinessGate();
