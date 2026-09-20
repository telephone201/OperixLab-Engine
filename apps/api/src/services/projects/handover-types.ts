/**
 * @file handover-types.ts
 * @description Types for Project Handover and Support Transition.
 */

import { ProjectStatus } from './types';

export enum HandoverStatus {
    DRAFT = 'DRAFT',
    PREPARING = 'PREPARING',
    READY_FOR_REVIEW = 'READY_FOR_REVIEW',
    IN_REVIEW = 'IN_REVIEW',
    BLOCKED = 'BLOCKED',
    APPROVED = 'APPROVED',
    HANDED_OVER = 'HANDED_OVER',
    SUPERSEDED = 'SUPERSEDED',
    CANCELLED = 'CANCELLED'
}

export enum HandoverItemCategory {
    DELIVERABLE = 'DELIVERABLE',
    DOCUMENTATION = 'DOCUMENTATION',
    CONFIGURATION = 'CONFIGURATION',
    ACCESS = 'ACCESS',
    TRAINING = 'TRAINING',
    OPERATIONS = 'OPERATIONS',
    TECHNICAL = 'TECHNICAL',
    SUPPORT = 'SUPPORT',
    OTHER = 'OTHER'
}

export enum HandoverItemStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    COMPLETED = 'COMPLETED',
    BLOCKED = 'BLOCKED',
    NOT_APPLICABLE = 'NOT_APPLICABLE'
}

export enum SupportReadinessStatus {
    NOT_READY = 'NOT_READY',
    READY = 'READY',
    BLOCKED = 'BLOCKED',
    REQUIRES_REVIEW = 'REQUIRES_REVIEW'
}

export enum SupportMode {
    MANUAL = 'MANUAL',
    OWNER_MANAGED = 'OWNER_MANAGED',
    CONTRACTED = 'CONTRACTED',
    OTHER = 'OTHER'
}

export enum SupportTransitionStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    BLOCKED = 'BLOCKED',
    CANCELLED = 'CANCELLED'
}

export interface Handover {
    handoverId: string;
    projectId: string;
    acceptanceId: string;
    scopeBaselineId: string;
    deliveryPlanVersionId: string;
    solutionVersionId: string;
    workflowVersionId: string;
    handoverVersion: number;
    status: HandoverStatus;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    preparedAt?: Date;
    approvedAt?: Date;
    completedAt?: Date;
}

export interface HandoverItem {
    handoverItemId: string;
    handoverId: string;
    category: HandoverItemCategory;
    title: string;
    description: string;
    required: boolean;
    status: HandoverItemStatus;
    evidenceReference?: string;
    owner?: string;
    completedAt?: Date;
    notes?: string;
}

export interface SupportReadiness {
    supportReadinessId: string;
    projectId: string;
    handoverId: string;
    status: SupportReadinessStatus;
    supportMode: SupportMode;
    supportReference: string;
    knownLimitations: string;
    operationalRequirements: string;
    escalationReference: string;
    preparedBy: string;
    preparedAt: Date;
}

export interface SupportTransition {
    supportTransitionId: string;
    projectId: string;
    handoverId: string;
    supportReadinessId: string;
    status: SupportTransitionStatus;
    transitionedBy: string;
    transitionedAt: Date;
    notes?: string;
}
