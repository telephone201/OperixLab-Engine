/**
 * @file requirement-types.ts
 * @description Core types for Requirements Extraction & Solution Specification.
 */

export type RequirementType =
    | 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'BUSINESS_RULE' | 'DATA'
    | 'INTEGRATION' | 'SECURITY' | 'HUMAN_IN_THE_LOOP' | 'OPERATIONAL'
    | 'REPORTING' | 'NOTIFICATION' | 'USER_EXPERIENCE' | 'COMPLIANCE' | 'CONSTRAINT';

export type RequirementPriority = 'MUST' | 'SHOULD' | 'COULD' | 'UNKNOWN';
export type RequirementCertainty = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';
export type RequirementStatus = 'CANDIDATE' | 'VALIDATED' | 'APPROVED' | 'SUPERSEDED';
export type AutomationBoundary = 'AUTOMATABLE' | 'PARTIALLY_AUTOMATABLE' | 'HUMAN_REQUIRED' | 'UNKNOWN';
export type DependencyType = 'REQUIRES' | 'BLOCKS' | 'ENHANCES' | 'RELATED';
export type ConflictStatus = 'UNRESOLVED' | 'RESOLVED' | 'NEEDS_CLIENT_CLARIFICATION';
export type AssumptionStatus = 'ACTIVE' | 'VALIDATED' | 'REJECTED' | 'NEEDS_CONFIRMATION';

export interface RequirementEvidence {
    evidenceId: string;
    contributionType: 'SUPPORTING' | 'CONTRADICTORY';
}

export interface Requirement {
    id: string;
    analysisId: string;
    sourcePainId?: string;
    type: RequirementType;
    category?: string;
    title: string;
    description: string;
    priority: RequirementPriority;
    certainty: RequirementCertainty;
    confidence: number;
    status: RequirementStatus;

    // Specifications
    triggerDefinition?: string;
    inputDefinition?: any;
    outputDefinition?: any;
    acceptanceCriteria?: any;
    businessRule?: string;
    dataRequirements?: any;
    integrationRequirements?: any;
    humanActionRequired: boolean;
    constraints?: string;
    securityRequirements?: string;

    automationBoundary: AutomationBoundary;
    reasoning: string;
    version: number;
    evidence: RequirementEvidence[];
}

export interface RequirementsAnalysis {
    id: string;
    leadId: string;
    researchVersionId: string;
    qualificationVersionId: string;
    painAnalysisVersionId: string;
    analysisVersion: number;
    status: RequirementStatus;
    overallCompleteness: number;
    overallConfidence: number;
    requirements: Requirement[];
    unresolvedQuestions: string[];
    createdAt: Date;
}

export interface RequirementDependency {
    sourceReqId: string;
    targetReqId: string;
    type: DependencyType;
    reason: string;
}

export interface RequirementConflict {
    reqAId: string;
    reqBId: string;
    type: string;
    description: string;
    status: ConflictStatus;
    resolution?: string;
}

export interface RequirementAssumption {
    reqId: string;
    assumptionText: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    validationMethod: string;
    status: AssumptionStatus;
}
