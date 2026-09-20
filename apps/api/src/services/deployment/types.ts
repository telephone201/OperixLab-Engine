/**
 * @file types.ts
 * @description Deployment-related enums and types for Phase 9 Step 4.
 */

export enum DeploymentStatus {
    NOT_READY = 'NOT_READY',
    ELIGIBILITY_CHECK = 'ELIGIBILITY_CHECK',
    ELIGIBLE = 'ELIGIBLE',
    BLOCKED = 'BLOCKED',
    AUTHORIZED = 'AUTHORIZED',
    DEPLOYMENT_PENDING = 'DEPLOYMENT_PENDING',
    DEPLOYING = 'DEPLOYING',
    DEPLOYED = 'DEPLOYED',
    DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
    VERIFICATION_PENDING = 'VERIFICATION_PENDING',
    VERIFIED = 'VERIFIED',
    ACTIVATION_PENDING = 'ACTIVATION_PENDING',
    ACTIVATING = 'ACTIVATING',
    ACTIVE = 'ACTIVE',
    ACTIVATION_FAILED = 'ACTIVATION_FAILED',
    ARCHIVED = 'ARCHIVED'
}

export enum DeploymentMode {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE'
}

export enum DeploymentEnvironment {
    LOCAL = 'LOCAL',
    STAGING = 'STAGING',
    PRODUCTION = 'PRODUCTION'
}

export interface DeploymentManifest {
    deploymentId: string;
    workflowVersionId: string;
    artifactId: string;
    artifactHash: string;
    solutionId: string;
    solutionVersionId: string;
    originType: string;
    environment: DeploymentEnvironment;
    requestedBy: string;
    requestedAt: Date;
    validationId: string;
    validationRulesetVersion: string;
    n8nTarget?: string;
    existingN8nWorkflowId?: string;
    deploymentMode: DeploymentMode;
    activationRequested: boolean;
}

export interface DeploymentSnapshot {
    snapshotId: string;
    deploymentId: string;
    n8nWorkflowId: string;
    environment: DeploymentEnvironment;
    workflowContentHash: string;
    workflowContent: any;
    capturedAt: Date;
}

export interface DeploymentVerification {
    verificationId: string;
    deploymentId: string;
    status: 'NOT_VERIFIED' | 'VERIFIED' | 'VERIFICATION_FAILED' | 'VERIFICATION_REQUIRES_REVIEW';
    deployedHash: string;
    expectedHash: string;
    verifiedAt: Date;
}

export type DeploymentErrorCode =
    | 'VALIDATION_NOT_PASSED'
    | 'ARTIFACT_HASH_MISMATCH'
    | 'ARTIFACT_NOT_FOUND'
    | 'WORKFLOW_VERSION_NOT_FOUND'
    | 'DEPLOYMENT_NOT_AUTHORIZED'
    | 'ACTIVATION_NOT_AUTHORIZED'
    | 'N8N_NOT_CONFIGURED'
    | 'N8N_UNREACHABLE'
    | 'N8N_AUTH_FAILED'
    | 'N8N_WORKFLOW_NOT_FOUND'
    | 'TARGET_IDENTITY_MISMATCH'
    | 'DEPLOYMENT_STATUS_UNKNOWN'
    | 'DEPLOYMENT_VERIFICATION_FAILED'
    | 'ACTIVATION_FAILED'
    | 'DUPLICATE_DEPLOYMENT'
    | 'ENVIRONMENT_REQUIRED';
