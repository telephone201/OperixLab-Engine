/**
 * @file types.ts
 * @description Governance and Rollback related types for Phase 9 Step 5.
 */

import { DeploymentEnvironment, DeploymentStatus } from '../deployment/types';

export enum ApprovalType {
    DEPLOYMENT = 'DEPLOYMENT',
    ACTIVATION = 'ACTIVATION',
    ROLLBACK = 'ROLLBACK',
    PRICING = 'PRICING',
    PROPOSAL = 'PROPOSAL',
    COMMERCIAL_PACKAGE = 'COMMERCIAL_PACKAGE',
    CHANGE_REQUEST = 'CHANGE_REQUEST'
}

export enum ApprovalDecision {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

export enum RollbackStatus {
    PENDING = 'PENDING',
    ELIGIBILITY_CHECK = 'ELIGIBILITY_CHECK',
    APPROVAL_PENDING = 'APPROVAL_PENDING',
    APPROVED = 'APPROVED',
    EXECUTING = 'EXECUTING',
    VERIFIED = 'VERIFIED',
    FAILED = 'FAILED'
}

export enum GovernanceState {
    GOVERNANCE_PENDING = 'GOVERNANCE_PENDING',
    DEPLOYMENT_APPROVAL_PENDING = 'DEPLOYMENT_APPROVAL_PENDING',
    DEPLOYMENT_APPROVED = 'DEPLOYMENT_APPROVED',
    DEPLOYMENT_REJECTED = 'DEPLOYMENT_REJECTED',
    DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',
    DEPLOYMENT_VERIFIED = 'DEPLOYMENT_VERIFIED',
    ACTIVATION_APPROVAL_PENDING = 'ACTIVATION_APPROVAL_PENDING',
    ACTIVATION_APPROVED = 'ACTIVATION_APPROVED',
    ACTIVATION_REJECTED = 'ACTIVATION_REJECTED',
    ACTIVATION_IN_PROGRESS = 'ACTIVATION_IN_PROGRESS',
    ACTIVE = 'ACTIVE',
    ROLLBACK_ELIGIBILITY_CHECK = 'ROLLBACK_ELIGIBILITY_CHECK',
    ROLLBACK_APPROVAL_PENDING = 'ROLLBACK_APPROVAL_PENDING',
    ROLLBACK_APPROVED = 'ROLLBACK_APPROVED',
    ROLLBACK_REJECTED = 'ROLLBACK_REJECTED',
    ROLLBACK_IN_PROGRESS = 'ROLLBACK_IN_PROGRESS',
    ROLLBACK_VERIFIED = 'ROLLBACK_VERIFIED',
    ROLLBACK_FAILED = 'ROLLBACK_FAILED',
    SUSPENDED = 'SUSPENDED',
    ARCHIVED = 'ARCHIVED'
}

export interface HumanApproval {
    approvalId: string;
    entityType: string;
    entityId: string;
    approvalType: ApprovalType;
    requestedBy: string;
    requestedAt: Date;
    decision: ApprovalDecision;
    decidedBy?: string;
    decidedAt?: Date;
    reason?: string;
    metadata?: any;
    expiresAt?: Date;
    workflowVersionId?: string;
    artifactHash?: string;
    environment?: DeploymentEnvironment;
    deploymentId?: string;
}

export interface KnownGoodVersion {
    knownGoodId: string;
    workflowVersionId: string;
    artifactHash: string;
    environment: DeploymentEnvironment;
    deploymentId: string;
    n8nWorkflowId: string;
    markedAt: Date;
    markedBy: string;
    reason: string;
    revokedAt?: Date;
    revocationReason?: string;
}

export interface RollbackOperation {
    rollbackId: string;
    currentDeploymentId: string;
    targetWorkflowVersionId: string;
    targetDeploymentId: string;
    environment: DeploymentEnvironment;
    n8nWorkflowId: string;
    incidentId: string;
    reasonCode: string;
    status: RollbackStatus;
    requestedBy: string;
    requestedAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    errorCode?: string;
    safeErrorMessage?: string;
}

export interface LifecycleTransition {
    eventId: string;
    entityId: string;
    previousState: string;
    newState: string;
    actor: string;
    reason: string;
    timestamp: Date;
    metadata?: any;
}
