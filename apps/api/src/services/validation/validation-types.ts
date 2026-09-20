/**
 * @file validation-types.ts
 * @description Core types and enums for the Phase 9 Validation Engine.
 */

export enum ValidationStatus {
    NOT_STARTED = 'NOT_STARTED',
    IN_PROGRESS = 'IN_PROGRESS',
    PASSED = 'PASSED',
    FAILED = 'FAILED',
    REQUIRES_REVIEW = 'REQUIRES_REVIEW',
    BLOCKED = 'BLOCKED'
}

export enum ValidationLayer {
    STRUCTURAL = 'STRUCTURAL',
    DEPENDENCY = 'DEPENDENCY',
    DATA = 'DATA',
    SECURITY = 'SECURITY',
    BUSINESS = 'BUSINESS',
    OPERATIONAL = 'OPERATIONAL'
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
    RESOLVED = 'RESOLVED',
    ACCEPTED_RISK = 'ACCEPTED_RISK',
    WAIVED = 'WAIVED'
}

export interface ValidationFinding {
    findingId: string;
    validationId: string;
    layer: ValidationLayer;
    ruleId: string;
    severity: FindingSeverity;
    status: FindingStatus;
    title: string;
    description: string;
    evidence?: string;
    workflowNodeId?: string;
    workflowPath?: string;
    expected?: string;
    actual?: string;
    reasoning?: string;
    blocking: boolean;
    requiresReview: boolean;
    createdAt: Date;
}

export interface ValidationLayerResult {
    layer: ValidationLayer;
    result: 'PASS' | 'FAIL' | 'WARN' | 'UNKNOWN';
    findings: ValidationFinding[];
    logs: string;
}

export interface ValidationReport {
    validationId: string;
    workflowVersionId: string;
    artifactHash: string;
    overallStatus: ValidationStatus;
    layerResults: Record<ValidationLayer, ValidationLayerResult>;
    allFindings: ValidationFinding[];
    blockingFindings: ValidationFinding[];
    reviewRequiredFindings: ValidationFinding[];
    summary: string;
}
