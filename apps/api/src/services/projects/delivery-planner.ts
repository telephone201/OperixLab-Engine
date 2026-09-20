/**
 * @file delivery-planner.ts
 * @description Deterministic engine to generate Delivery Plans based on strategy and scope.
 */

import {
    DeliveryPlan,
    Milestone,
    Task,
    MilestoneType,
    TaskType,
    TaskStatus,
    DeliveryPlanInput
} from './delivery-plan-types';
import { OriginType } from '../versioning/version-service';

export class DeliveryPlanner {
    private readonly RULES_VERSION = 'v1.0';

    /**
     * Generates a deterministic set of milestones and tasks based on the OriginType.
     */
    generatePlanComponents(input: DeliveryPlanInput, originType: OriginType): {
        milestones: Milestone[],
        tasks: Task[],
        taskDependencies: { taskId: string, dependsOnTaskId: string }[],
        milestoneDependencies: { milestoneId: string, dependsOnMilestoneId: string }[]
    } {
        const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const projectId = input.projectId;

        // Define the Base Sequence
        const milestones: Milestone[] = [];
        const tasks: Task[] = [];
        const taskDeps: { taskId: string, dependsOnTaskId: string }[] = [];
        const milestoneDeps: { milestoneId: string, dependsOnMilestoneId: string }[] = [];

        // 1. Project Initialization (Universal)
        const mInit = this.createMilestone(planId, MilestoneType.PROJECT_INITIALIZATION, 0);
        milestones.push(mInit);

        const tInit1 = this.createTask(projectId, planId, mInit.milestoneId, 'Initialize Project Workspace', 'Internal setup', TaskType.INTERNAL, 'MEDIUM');
        tasks.push(tInit1);

        // 2. Requirements Confirmation (Universal)
        const mReq = this.createMilestone(planId, MilestoneType.REQUIREMENTS_CONFIRMATION, 1);
        milestones.push(mReq);
        milestoneDeps.push({ milestoneId: mReq.milestoneId, dependsOnMilestoneId: mInit.milestoneId });

        const tReq1 = this.createTask(projectId, planId, mReq.milestoneId, 'Confirm Solution Scope', 'Verify requirements with client', TaskType.REVIEW, 'HIGH');
        tasks.push(tReq1);
        taskDeps.push({ taskId: tReq1.taskId, dependsOnTaskId: tInit1.taskId });

        // 3. Access and Configuration (Universal)
        const mAcc = this.createMilestone(planId, MilestoneType.ACCESS_CONFIGURATION, 2);
        milestones.push(mAcc);
        milestoneDeps.push({ milestoneId: mAcc.milestoneId, dependsOnMilestoneId: mReq.milestoneId });

        const tAcc1 = this.createTask(projectId, planId, mAcc.milestoneId, 'Configure Environment Access', 'Setup n8n and API credentials', TaskType.CONFIGURATION, 'CRITICAL');
        tasks.push(tAcc1);
        taskDeps.push({ taskId: tAcc1.taskId, dependsOnTaskId: tReq1.taskId });

        // 4. Strategy-Specific Implementation
        let lastTaskId = tAcc1.taskId;
        let lastMilestoneId = mAcc.milestoneId;

        if (originType === OriginType.REUSED) {
            // Minimal technical effort, mostly validation and deployment
            const mVal = this.createMilestone(planId, MilestoneType.VALIDATION, 3);
            milestones.push(mVal);
            milestoneDeps.push({ milestoneId: mVal.milestoneId, dependsOnMilestoneId: lastMilestoneId });

            const tVal1 = this.createTask(projectId, planId, mVal.milestoneId, 'Verify Workflow Validity', 'Run Phase 9 Validation Suite', TaskType.VERIFICATION, 'HIGH');
            tasks.push(tVal1);
            taskDeps.push({ taskId: tVal1.taskId, dependsOnTaskId: lastTaskId });
            lastTaskId = tVal1.taskId;
            lastMilestoneId = mVal.milestoneId;
        }
        else if (originType === OriginType.CUSTOMIZED || originType === OriginType.COMPOSED) {
            // Customization/Composition requires verification of the new logic
            const mImpl = this.createMilestone(planId, MilestoneType.WORKFLOW_CONFIGURATION, 3);
            milestones.push(mImpl);
            milestoneDeps.push({ milestoneId: mImpl.milestoneId, dependsOnMilestoneId: lastMilestoneId });

            const tImpl1 = this.createTask(projectId, planId, mImpl.milestoneId, 'Implement Custom Logic', 'Apply modifications or composition', TaskType.TECHNICAL, 'HIGH');
            tasks.push(tImpl1);
            taskDeps.push({ taskId: tImpl1.taskId, dependsOnTaskId: lastTaskId });

            const tImpl2 = this.createTask(projectId, planId, mImpl.milestoneId, 'Verify Integration Points', 'Check data flow between nodes', TaskType.VERIFICATION, 'MEDIUM');
            tasks.push(tImpl2);
            taskDeps.push({ taskId: tImpl2.taskId, dependsOnTaskId: tImpl1.taskId });

            lastTaskId = tImpl2.taskId;
            lastMilestoneId = mImpl.milestoneId;
        }
        else if (originType === OriginType.CUSTOM_BUILT) {
            // Full build cycle
            const mBuild = this.createMilestone(planId, MilestoneType.TECHNICAL_PREPARATION, 3);
            milestones.push(mBuild);
            milestoneDeps.push({ milestoneId: mBuild.milestoneId, dependsOnMilestoneId: lastMilestoneId });

            const tBuild1 = this.createTask(projectId, planId, mBuild.milestoneId, 'Design Workflow Logic', 'Map processes to n8n nodes', TaskType.TECHNICAL, 'HIGH');
            tasks.push(tBuild1);
            taskDeps.push({ taskId: tBuild1.taskId, dependsOnTaskId: lastTaskId });

            const tBuild2 = this.createTask(projectId, planId, mBuild.milestoneId, 'Construct Workflow', 'Build nodes and connections', TaskType.TECHNICAL, 'HIGH');
            tasks.push(tBuild2);
            taskDeps.push({ taskId: tBuild2.taskId, dependsOnTaskId: tBuild1.taskId });

            lastTaskId = tBuild2.taskId;
            lastMilestoneId = mBuild.milestoneId;
        }

        // 5. Validation and Deployment (Universal)
        const mDeploy = this.createMilestone(planId, MilestoneType.DEPLOYMENT, 4);
        milestones.push(mDeploy);
        milestoneDeps.push({ milestoneId: mDeploy.milestoneId, dependsOnMilestoneId: lastMilestoneId });

        const tDep1 = this.createTask(projectId, planId, mDeploy.milestoneId, 'Execute Technical Deployment', 'Trigger Phase 9 Deployment Service', TaskType.TECHNICAL, 'CRITICAL');
        tasks.push(tDep1);
        taskDeps.push({ taskId: tDep1.taskId, dependsOnTaskId: lastTaskId });

        const tDep2 = this.createTask(projectId, planId, mDeploy.milestoneId, 'Verify Deployment State', 'Ensure status is VERIFIED', TaskType.VERIFICATION, 'HIGH');
        tasks.push(tDep2);
        taskDeps.push({ taskId: tDep2.taskId, dependsOnTaskId: tDep1.taskId });

        // 6. Client Testing Preparation (Universal)
        const mTest = this.createMilestone(planId, MilestoneType.CLIENT_TESTING, 5);
        milestones.push(mTest);
        milestoneDeps.push({ milestoneId: mTest.milestoneId, dependsOnMilestoneId: mDeploy.milestoneId });

        const tTest1 = this.createTask(projectId, planId, mTest.milestoneId, 'Prepare UAT Data', 'Setup test cases and data', TaskType.CONFIGURATION, 'MEDIUM');
        tasks.push(tTest1);
        taskDeps.push({ taskId: tTest1.taskId, dependsOnTaskId: tDep2.taskId });

        return { milestones, tasks, taskDependencies: taskDeps, milestoneDependencies: milestoneDeps };
    }

    private createMilestone(planId: string, type: MilestoneType, index: number): Milestone {
        return {
            milestoneId: `ms_${Math.random().toString(36).substr(2, 9)}`,
            planId,
            type,
            title: type.replace(/_/g, ' '),
            description: `Standard ${type} phase`,
            orderIndex: index,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    private createTask(projectId: string, planId: string, milestoneId: string, title: string, description: string, type: TaskType, priority: any): Task {
        return {
            taskId: `tsk_${Math.random().toString(36).substr(2, 9)}`,
            projectId,
            planId,
            milestoneId,
            title,
            description,
            taskType: type,
            status: TaskStatus.PENDING,
            priority,
            owner: 'unassigned',
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    public getRulesVersion(): string {
        return this.RULES_VERSION;
    }
}

export const deliveryPlanner = new DeliveryPlanner();
