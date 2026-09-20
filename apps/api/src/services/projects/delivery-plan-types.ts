/**
 * @file delivery-plan-types.ts
 * @description Types for the Delivery Planning Engine in Phase 10.
 */

import { ProjectStatus } from './types';

export enum DeliveryPlanStatus {
    DRAFT = 'DRAFT',
    READY = 'READY',
    ACTIVE = 'ACTIVE',
    COMPLETED = 'COMPLETED',
    ARCHIVED = 'ARCHIVED'
}

export enum MilestoneType {
    PROJECT_INITIALIZATION = 'PROJECT_INITIALIZATION',
    REQUIREMENTS_CONFIRMATION = 'REQUIREMENTS_CONFIRMATION',
    ACCESS_CONFIGURATION = 'ACCESS_CONFIGURATION',
    TECHNICAL_PREPARATION = 'TECHNICAL_PREPARATION',
    WORKFLOW_CONFIGURATION = 'WORKFLOW_CONFIGURATION',
    INTEGRATION_SETUP = 'INTEGRATION_SETUP',
    VALIDATION = 'VALIDATION',
    DEPLOYMENT = 'DEPLOYMENT',
    CLIENT_TESTING = 'CLIENT_TESTING'
}

export enum TaskType {
    INTERNAL = 'INTERNAL',
    CLIENT_ACTION = 'CLIENT_ACTION',
    TECHNICAL = 'TECHNICAL',
    REVIEW = 'REVIEW',
    APPROVAL = 'APPROVAL',
    VERIFICATION = 'VERIFICATION',
    CONFIGURATION = 'CONFIGURATION',
    DOCUMENTATION = 'DOCUMENTATION'
}

export enum TaskStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    IN_PROGRESS = 'IN_PROGRESS',
    BLOCKED = 'BLOCKED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED'
}

export interface DeliveryPlan {
    planId: string;
    projectId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    workflowVersionId: string;
    planVersion: number;
    status: DeliveryPlanStatus;
    planningRulesVersion: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

export interface Milestone {
    milestoneId: string;
    planId: string;
    type: MilestoneType;
    title: string;
    description: string;
    orderIndex: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    createdAt: Date;
    updatedAt: Date;
}

export interface Task {
    taskId: string;
    projectId: string;
    planId: string;
    milestoneId: string;
    title: string;
    description: string;
    taskType: TaskType;
    status: TaskStatus;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    owner: string;
    dueDate?: Date;
    startedAt?: Date;
    completedAt?: Date;
    evidence?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface TaskDependency {
    taskId: string;
    dependsOnTaskId: string;
}

export interface MilestoneDependency {
    milestoneId: string;
    dependsOnMilestoneId: string;
}

export interface DeliveryPlanInput {
    projectId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    workflowVersionId: string;
    userId: string;
}
