/**
 * @file scope-types.ts
 * @description Types for Scope Management, Requirements Confirmation and Change Requests.
 */

import { ProjectStatus } from './types';

export enum ConfirmationStatus {
    DRAFT = 'DRAFT',
    PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
    CONFIRMED = 'CONFIRMED',
    SUPERSEDED = 'SUPERSEDED',
    CANCELLED = 'CANCELLED'
}

export enum ScopeClassification {
    INCLUDED = 'INCLUDED',
    OPTIONAL = 'OPTIONAL',
    OUT_OF_SCOPE = 'OUT_OF_SCOPE',
    UNRESOLVED = 'UNRESOLVED'
}

export enum ScopeBaselineStatus {
    DRAFT = 'DRAFT',
    PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
    CONFIRMED = 'CONFIRMED',
    SUPERSEDED = 'SUPERSEDED',
    ARCHIVED = 'ARCHIVED'
}

export enum ChangeRequestStatus {
    DRAFT = 'DRAFT',
    SUBMITTED = 'SUBMITTED',
    UNDER_REVIEW = 'UNDER_REVIEW',
    IMPACT_ANALYSIS_REQUIRED = 'IMPACT_ANALYSIS_REQUIRED',
    IMPACT_ANALYZED = 'IMPACT_ANALYZED',
    PENDING_APPROVAL = 'PENDING_APPROVAL',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    IMPLEMENTATION_PENDING = 'IMPLEMENTATION_PENDING',
    IMPLEMENTED = 'IMPLEMENTED',
    SUPERSEDED = 'SUPERSEDED'
}

export enum ChangeRequestType {
    SCOPE_ADDITION = 'SCOPE_ADDITION',
    SCOPE_REMOVAL = 'SCOPE_REMOVAL',
    REQUIREMENT_CHANGE = 'REQUIREMENT_CHANGE',
    INTEGRATION_CHANGE = 'INTEGRATION_CHANGE',
    BEHAVIOR_CHANGE = 'BEHAVIOR_CHANGE',
    DATA_CHANGE = 'DATA_CHANGE',
    UI_CHANGE = 'UI_CHANGE',
    TIMELINE_CHANGE = 'TIMELINE_CHANGE',
    DOCUMENTATION_CHANGE = 'DOCUMENTATION_CHANGE',
    OTHER = 'OTHER'
}

export enum ImpactLevel {
    NONE = 'NONE',
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    UNKNOWN = 'UNKNOWN'
}

export interface RequirementsConfirmation {
    confirmationId: string;
    projectId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    requirementsVersionId: string;
    deliveryPlanVersionId: string;
    confirmationVersion: number;
    status: ConfirmationStatus;
    confirmedBy?: string;
    confirmedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface RequirementSnapshotItem {
    itemId: string;
    confirmationId: string;
    requirementId: string;
    requirementVersionId: string;
    priority: string;
    classification: ScopeClassification;
    status: string;
    reason?: string;
    sourceReference?: string;
}

export interface ScopeBaseline {
    scopeBaselineId: string;
    projectId: string;
    confirmationId: string;
    solutionVersionId: string;
    deliveryPlanVersionId: string;
    version: number;
    status: ScopeBaselineStatus;
    createdBy: string;
    createdAt: Date;
    confirmedBy?: string;
    confirmedAt?: Date;
    supersededAt?: Date;
    contentHash?: string;
}

export interface ScopeItem {
    scopeItemId: string;
    scopeBaselineId: string;
    sourceRequirementId: string;
    title: string;
    description: string;
    classification: ScopeClassification;
    priority: string;
    deliveryReference?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ChangeRequest {
    changeRequestId: string;
    projectId: string;
    scopeBaselineId: string;
    requestedBy: string;
    requestedAt: Date;
    title: string;
    description: string;
    reason: string;
    classification: ChangeRequestType;
    impactStatus: string;
    technicalImpact: ImpactLevel;
    commercialImpact: ImpactLevel;
    scheduleImpact: ImpactLevel;
    riskLevel: string;
    status: ChangeRequestStatus;
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    decisionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ImpactAnalysis {
    analysisId: string;
    changeRequestId: string;
    requirementsImpact: string;
    scopeImpact: string;
    solutionImpact: string;
    workflowImpact: string;
    deliveryPlanImpact: string;
    scheduleImpact: string;
    commercialImpact: string;
    technicalImpact: string;
    riskImpact: string;
    affectedItems: string[];
    recommendation: string;
    confidence: string;
    analyzedAt: Date;
    analyzedBy: string;
}
