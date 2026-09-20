/**
 * @file domain.ts extension for Commercialization.
 * @description Adds commercial types to the existing domain types.
 */

export enum CommercialPackageStatus {
    DRAFT = 'DRAFT',
    READY_FOR_PRICING = 'READY_FOR_PRICING',
    PRICING_IN_PROGRESS = 'PRICING_IN_PROGRESS',
    PRICING_READY = 'PRICING_READY',
    OFFER_READY = 'OFFER_READY',
    PROPOSAL_READY = 'PROPOSAL_READY',
    SENT = 'SENT',
    NEGOTIATION = 'NEGOTIATION',
    ACCEPTED = 'ACCEPTED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

export enum PricingStatus {
    DRAFT = 'DRAFT',
    GENERATED = 'GENERATED',
    PENDING_REVIEW = 'PENDING_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SUPERSEDED = 'SUPERSEDED',
    EXPIRED = 'EXPIRED'
}

export interface PricingRecommendation {
    pricingId: string;
    commercialPackageId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    pricingVersion: number;
    currency: string;
    marketRangeMin: number;
    marketRangeMax: number;
    costFloor: number;
    targetPrice: number;
    recommendedPrice: number;
    pricingConfidence: number;
    marketDataConfidence: number;
    reasoning: string;
    assumptions: string;
    riskFactors: string;
    pricingEvidenceReference?: string;
    status: PricingStatus;
    createdAt: Date;
    createdBy: string;
}

export interface OfferOption {
    offerId: string;
    commercialPackageId: string;
    name: string;
    description: string;
    includedScope: string[];
    optionalScope: string[];
    outOfScope: string[];
    setupFee: number;
    recurringFee: number;
    currency: string;
    billingCycle: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
    minimumCommitmentMonths: number;
    paymentTerms: string;
    setupPaymentPercentage: number;
    setupBalanceTerms: string;
    implementationStartCondition: string;
    cancellationTerms: string;
    scopeChangeTerms: string;
    supportTerms: string;
    validUntil: Date;
    status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
    version: number;
    createdAt: Date;
    createdBy: string;
}

export interface Proposal {
    proposalId: string;
    commercialPackageId: string;
    status: 'DRAFT' | 'GENERATING' | 'GENERATED' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'SENT' | 'OPENED' | 'EXPIRED' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED';
    version: number;
    createdAt: Date;
    updatedAt: Date;
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

export interface StalenessResult {
    isStale: boolean;
    checkedAt: Date;
    reasons: string[];
    changedDependencies: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    recommendedAction: string;
}

export interface CommercialPackage {
    id: string;
    lead_id: string;
    company_id: string;
    contact_id: string;
    solution_architecture_id: string;
    solution_version_id: string;
    status: CommercialPackageStatus;
    currency: string;
    valid_until?: Date;
    version: number;
    created_at: Date;
    updated_at: Date;
}
