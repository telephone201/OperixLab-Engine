/**
 * @file delivery-plan-service.ts
 * @description Service for persisting and managing the lifecycle of Delivery Plans.
 */

import { db } from '../../lib/db';
import {
    DeliveryPlan,
    DeliveryPlanStatus,
    Milestone,
    Task,
    TaskDependency,
    MilestoneDependency,
    DeliveryPlanInput
} from './delivery-plan-types';
import { deliveryPlanner } from './delivery-planner';
import { projectStartEligibilityGate } from './eligibility-gate';
import { auditLogger } from '../../core/logging/audit-logger';

export class DeliveryPlanService {
    /**
     * Generates and persists a new Delivery Plan if eligible.
     */
    async generatePlan(params: DeliveryPlanInput): Promise<DeliveryPlan> {
        // 1. Eligibility Check
        const eligibility = await projectStartEligibilityGate.checkEligibility(params.projectId);
        if (!eligibility.eligible) {
            throw new Error(`PLAN_GENERATION_BLOCKED: ${eligibility.reason}`);
        }

        // 2. Idempotency Check
        const existingPlan = await db.delivery_plans.findFirst({
            where: {
                projectId: params.projectId,
                solutionVersionId: params.solutionVersionId,
                workflowVersionId: params.workflowVersionId,
                status: 'ACTIVE'
            }
        });
        if (existingPlan) return this.mapToDomain(existingPlan);

        // 3. Generate Components via Planner
        // For a real impl, we'd fetch the OriginType from the version service
        const originType = 'REUSED' as any; // Simplified for Step 3; in full we fetch this
        const components = deliveryPlanner.generatePlanComponents({ ...params, originType: originType as any }, originType);

        // 4. Persistence (Simplified for this step, assuming tables exist)
        const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await db.delivery_plans.create({
            data: {
                id: planId,
                projectId: params.projectId,
                solutionArchitectureId: params.solutionArchitectureId,
                solutionVersionId: params.solutionVersionId,
                workflowVersionId: params.workflowVersionId,
                planVersion: 1,
                status: 'ACTIVE',
                planningRulesVersion: deliveryPlanner.getRulesVersion(),
                createdBy: params.userId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        // Batch insert milestones and tasks
        await db.delivery_milestones.createMany({ data: components.milestones });
        await db.delivery_tasks.createMany({ data: components.tasks });
        await db.delivery_task_dependencies.createMany({ data: components.taskDependencies });
        await db.delivery_milestone_dependencies.createMany({ data: components.milestoneDependencies });

        await auditLogger.log({
            action: 'DELIVERY_PLAN_CREATED',
            entityType: 'DeliveryPlan',
            entityId: planId,
            details: { version: 1, rules: deliveryPlanner.getRulesVersion() }
        });

        return {
            planId,
            projectId: params.projectId,
            solutionArchitectureId: params.solutionArchitectureId,
            solutionVersionId: params.solutionVersionId,
            workflowVersionId: params.workflowVersionId,
            planVersion: 1,
            status: 'ACTIVE',
            planningRulesVersion: deliveryPlanner.getRulesVersion(),
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: params.userId
        };
    }

    async getPlan(planId: string): Promise<DeliveryPlan> {
        const plan = await db.delivery_plans.findUnique({ where: { id: planId } });
        if (!plan) throw new Error('PLAN_NOT_FOUND');
        return this.mapToDomain(plan);
    }

    private mapToDomain(plan: any): DeliveryPlan {
        return {
            planId: plan.id,
            projectId: plan.projectId,
            solutionArchitectureId: plan.solutionArchitectureId,
            solutionVersionId: plan.solutionVersionId,
            workflowVersionId: plan.workflowVersionId,
            planVersion: plan.planVersion,
            status: plan.status as DeliveryPlanStatus,
            planningRulesVersion: plan.planningRulesVersion,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
            createdBy: plan.createdBy
        };
    }
}

export const deliveryPlanService = new DeliveryPlanService();

