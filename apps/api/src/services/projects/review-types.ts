/**
 * @file review-types.ts
 * @description Types for Client Review and Acceptance Governance.
 */

import { ProjectStatus } from './types';
import { ScopeClassification } from './scope-types';

export enum ReviewSessionStatus {
    DRAFT = 'DRAFT',
    READY_FOR_REVIEW = 'READY_FOR_REVIEW',
    IN_REVIEW = 'IN_REVIEW',
    CHANGES_REQUESTED = 'CHANGES_REQUESTED',
    ACCEPTANCE_PENDING = 'ACCEPTANCE_PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    SUPERSEDED = 'SUPERSEDED'
}

export enum ReviewItemStatus {
    PENDING = 'PENDING',
    PASS = 'PASS',
    FAIL = 'FAIL',
    NOT_APPLICABLE = 'NOT_APPLICABLE',
    BLOCKED = 'BLOCKED',
    CLARIFICATION_REQUIRED = 'CLARIFICATION_REQUIRED'
}

export enum ReviewEvidenceType {
    DELIVERY_ARTIFACT = 'DELIVERY_ARTIFACT',
    SCREENSHOT = 'SCREENSHOT',
    DEMO = 'DEMO',
    DOCUMENT = 'DOCUMENT',
    TEST_RESULT = 'TEST_RESULT',
    DEPLOYMENT_VERIFICATION = 'DEPLOYMENT_VERIFICATION',
    WORKFLOW_VERIFICATION = 'WORKFLOW_VERIFICATION',
    CLIENT_PROVIDED = 'CLIENT_PROVIDED',
    OTHER = 'OTHER'
}

export enum FeedbackClassification {
    COMMENT = 'COMMENT',
    QUESTION = 'QUESTION',
    ISSUE = 'ISSUE',
    CHANGE_REQUEST = 'CHANGE_REQUEST',
    APPROVAL_NOTE = 'APPROVAL_NOTE'
}

export enum FindingSeverity {
    INFO = 'INFO',
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

export enum FindingStatus {
    OPEN = 'OPEN',
    ACKNOWLEDGED = 'ACKNOWLEDGED',
    RESOLVED = 'RESOLVED',
    WAIVED = 'WAIVED',
    CONVERTED_TO_CHANGE_REQUEST = 'CONVERTED_TO_CHANGE_REQUEST',
    CLOSED = 'CLOSED'
}

export enum AcceptanceDecision {
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    CONDITIONAL_ACCEPTANCE = 'CONDITIONAL_ACCEPTANCE'
}

export interface ReviewSession {
    reviewSessionId: string;
    projectId: string;
    scopeBaselineId: string;
    deliveryPlanVersionId: string;
    solutionVersionId: string;
    workflowVersionId: string;
    reviewVersion: number;
    status: ReviewSessionStatus;
    startedAt?: Date;
    completedAt?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ReviewItem {
    reviewItemId: string;
    reviewSessionId: string;
    scopeItemId?: string;
    deliveryTaskId?: string;
    milestoneId?: string;
    title: string;
    description: string;
    expectedOutcome: string;
    status: ReviewItemStatus;
    evidenceRequired: boolean;
    evidenceReference?: string;
    reviewerComment?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ReviewFeedback {
    feedbackId: string;
    reviewSessionId: string;
    reviewItemId?: string;
    submittedBy: string;
    submittedAt: Date;
    comment: string;
    classification: FeedbackClassification;
    severity: FindingSeverity;
    attachmentReference?: string;
    status: string;
}

export interface ReviewFinding {
    findingId: string;
    reviewSessionId: string;
    reviewItemId: string;
    description: string;
    severity: FindingSeverity;
    status: FindingStatus;
    evidence?: string;
    owner?: string;
    resolution?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface AcceptanceRecord {
    acceptanceId: string;
    reviewSessionId: string;
    projectId: string;
    scopeBaselineId: string;
    deliveryPlanVersionId: string;
    decision: AcceptanceDecision;
    decidedBy: string;
    decidedAt: Date;
    reason: string;
    scopeHash: string;
    reviewHash: string;
    createdAt: Date;
}
