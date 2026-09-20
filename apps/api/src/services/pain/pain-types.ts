/**
 * @file pain-types.ts
 * @description Core types for Pain Analysis and Problem Intelligence.
 */

export type PainType =
    | 'LEAD_MANAGEMENT' | 'CUSTOMER_SUPPORT' | 'SALES_PROCESS' | 'MARKETING'
    | 'FOLLOW_UP' | 'SCHEDULING' | 'DATA_ENTRY' | 'REPORTING'
    | 'CRM_OPERATIONS' | 'COMMUNICATION' | 'ORDER_PROCESSING' | 'INTERNAL_OPERATIONS'
    | 'DOCUMENT_PROCESSING' | 'APPROVAL_PROCESS' | 'INTEGRATION' | 'DATA_FRAGMENTATION'
    | 'MANUAL_REPETITIVE_WORK' | 'RESPONSE_DELAY' | 'VISIBILITY_GAP' | 'OTHER' | 'UNKNOWN';

export type EvidenceLevel = 'OBSERVED' | 'INFERRED' | 'UNKNOWN';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type Frequency = 'RARE' | 'OCCASIONAL' | 'REGULAR' | 'FREQUENT' | 'CONTINUOUS' | 'UNKNOWN';
export type AutomationRelevance = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type PainStatus = 'DRAFT' | 'EVIDENCE_REQUIRED' | 'SUPPORTED' | 'NEEDS_RESEARCH' | 'CONTRADICTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
export type PainPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type RelationshipType = 'ROOT_CAUSE' | 'SYMPTOM' | 'CONSEQUENCE' | 'RELATED';

export interface PainEvidence {
    evidenceId: string;
    contributionType: 'SUPPORTING' | 'CONTRADICTORY';
}

export interface PainImpact {
    impactType: string;
    impactCategory: 'OPERATIONAL' | 'COMMERCIAL' | 'CUSTOMER';
    level: Severity;
    evidence: string;
    confidence: Confidence;
    reasoning: string;
}

export interface Pain {
    id: string;
    analysisId: string;
    painType: PainType;
    title: string;
    description: string;
    evidenceType: EvidenceLevel;
    severity: Severity;
    frequency: Frequency;
    automationRelevance: AutomationRelevance;
    confidence: number; // 0.0 to 1.0
    status: PainStatus;
    priority: PainPriority;
    reasoning: string;
    source: string;
    version: number;
    evidence: PainEvidence[];
}

export interface PainAnalysis {
    id: string;
    leadId: string;
    researchVersionId: string;
    qualificationVersionId: string;
    analysisVersion: number;
    status: PainStatus;
    overallConfidence: number;
    primaryPainId?: string;
    pains: Pain[];
    unresolvedQuestions: string[];
    createdAt: Date;
}

export interface PainRelationship {
    parentPainId: string;
    childPainId: string;
    type: RelationshipType;
    confidence: number;
}
