/**
 * @file completion-types.ts
 * @description Types for Project Completion and Closure Governance.
 */

import { ProjectStatus } from './types';

export enum CompletionStatus {
    NOT_READY = 'NOT_READY',
    READY = 'READY',
    BLOCKED = 'BLOCKED',
    REQUIRES_REVIEW = 'REQUIRES_REVIEW',
    SUPERSEDED = 'SUPERSEDED'
}

export enum CompletionReviewStatus {
    DRAFT = 'DRAFT',
    READY = 'READY',
    IN_REVIEW = 'IN_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SUPERSEDED = 'SUPERSEDED',
    CANCELLED = 'CANCELLED'
}

export enum CompletionDecision {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

export enum CompletionItemStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    BLOCKED = 'BLOCKED',
    WAIVED = 'WAIVED',
    NOT_APPLICABLE = 'NOT_APPLICABLE'
}

export interface CompletionReadiness {
    completionReadinessId: string;
    projectId: string;
    handoverId: string;
    acceptanceId: string;
    scopeVersionId: string;
    deliveryPlanVersionId: string;
    supportTransitionId?: string;
    status: CompletionStatus;
    evaluatedAt: Date;
    evaluatedBy: string;
    rulesVersion: string;
    blockingReasons: string[];
    warnings: string[];
    evidenceReferences: string[];
    createdAt: Date;
}

export interface CompletionItem {
    completionItemId: string;
    completionReviewId: string;
    category: string;
    title: string;
    description: string;
    required: boolean;
    status: CompletionItemStatus;
    evidenceReference?: string;
    owner?: string;
    completedAt?: Date;
    notes?: string;
}

export interface CompletionReview {
    completionReviewId: string;
    projectId: string;
    completionReadinessId: string;
    completionVersion: number;
    status: CompletionReviewStatus;
    reviewedBy: string;
    reviewedAt: Date;
    decision: CompletionDecision;
    reason: string;
    evidenceSnapshot: string;
    createdAt: Date;
}

export interface ProjectClosureSnapshot {
    snapshotId: string;
    projectId: string;
    acceptanceId: string;
    scopeVersionId: string;
    deliveryPlanVersionId: string;
    solutionVersionId: string;
    workflowVersionId: string;
    handoverId: string;
    supportTransitionId?: string;
    completionReviewId: string;
    completionVersion: number;
    completionDate: Date;
    closureHash: string;
    createdAt: Date;
}
