/**
 * @file commercial-types.ts
 * @description Core types for the Commercialization Engine.
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

export enum OfferStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    SUPERSEDED = 'SUPERSEDED',
    ARCHIVED = 'ARCHIVED'
}

export enum ScopeBoundary {
    INCLUDED = 'INCLUDED',
    OPTIONAL = 'OPTIONAL',
    OUT_OF_SCOPE = 'OUT_OF_SCOPE'
}

export enum BillingCycle {
    MONTHLY = 'MONTHLY',
    ANNUAL = 'ANNUAL',
    ONE_TIME = 'ONE_TIME'
}

export interface CommercialPackage {
    commercialPackageId: string;
    leadId: string;
    companyId: string;
    contactId: string;
    solutionArchitectureId: string;
    solutionVersionId: string;
    requirementsVersionId?: string;
    painAnalysisVersionId?: string;
    qualificationVersionId?: string;
    intentVersionId?: string;
    demoId?: string;
    status: CommercialPackageStatus;
    currency: string;
    validUntil?: Date;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy?: string;
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
    includedScope: string[]; // References to requirement IDs
    optionalScope: string[];
    outOfScope: string[];
    setupFee: number;
    recurringFee: number;
    currency: string;
    billingCycle: BillingCycle;
    minimumCommitmentMonths: number;
    paymentTerms: string;
    setupPaymentPercentage: number;
    setupBalanceTerms: string;
    implementationStartCondition: string;
    cancellationTerms: string;
    scopeChangeTerms: string;
    supportTerms: string;
    validUntil: Date;
    status: OfferStatus;
    version: number;
    createdAt: Date;
    createdBy: string;
}
