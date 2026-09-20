/**
 * @file proposal-types.ts
 * @description Domain types for the Proposal Engine.
 */

import { CommercialPackageStatus } from './commercial-types';

export enum ProposalStatus {
    DRAFT = 'DRAFT',
    GENERATING = 'GENERATING',
    GENERATED = 'GENERATED',
    READY_FOR_REVIEW = 'READY_FOR_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SENT = 'SENT',
    OPENED = 'OPENED',
    EXPIRED = 'EXPIRED',
    ACCEPTED = 'ACCEPTED',
    DECLINED = 'DECLINED',
    SUPERSEDED = 'SUPERSEDED'
}

export interface Proposal {
    proposalId: string;
    commercialPackageId: string;
    status: ProposalStatus;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    validUntil?: Date;
}

export interface ProposalVersion {
    proposalVersionId: string;
    proposalId: string;
    versionNumber: number;
    commercialPackageId: string;
    pricingRecommendationId: string;
    offerOptionId: string;
    solutionVersionId: string;
    requirementsVersionId: string;
    painAnalysisVersionId: string;
    qualificationVersionId: string;
    intentVersionId?: string;
    demoId?: string;
    content: ProposalContent;
    contentHash: string;
    status: ProposalStatus;
    createdAt: Date;
    createdBy: string;
    validUntil?: Date;
}

export interface ProposalContent {
    introduction: string;
    companyUnderstanding: string;
    painSummary: string;
    requirementsSummary: string;
    recommendedSolution: string;
    solutionExplanation: string;
    expectedImpact: string;
    demo: string;
    scope: {
        included: string[];
        optional: string[];
        outOfScope: string[];
    };
    commercialOptions: any[];
    terms: string;
    assumptions: string;
    faq: string;
    nextSteps: string;
    contact: string;
}

export interface ProposalGenerationInput {
    commercialPackageId: string;
    companyContext: any;
    contactContext: any;
    solutionVersionId: string;
    requirementsVersionId: string;
    painVersionId: string;
    pricingRecommendationId: string;
    offerOptionId: string;
    demoId?: string;
    terms: string;
    generationRulesVersion: string;
}

export interface ProposalGenerationResult {
    proposalVersionId: string;
    status: ProposalStatus;
    content: ProposalContent;
}
