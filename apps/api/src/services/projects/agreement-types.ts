/**
 * @file agreement-types.ts
 * @description Domain types for Commercial Agreements and the Agreement lifecycle.
 */

export enum AgreementStatus {
    DRAFT = 'DRAFT',
    READY_FOR_ACCEPTANCE = 'READY_FOR_ACCEPTANCE',
    SENT = 'SENT',
    VIEWED = 'VIEWED',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
    WITHDRAWN = 'WITHDRAWN',
    STALE = 'STALE'
}

export interface CommercialAgreement {
    agreementId: string;
    commercialPackageId: string;
    offerOptionId: string;
    proposalVersionId: string;
    solutionVersionId: string;
    requirementsVersionId?: string;
    companyId: string;
    contactId?: string;
    status: AgreementStatus;
    fingerprint: string; // Hash of material terms to detect staleness
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    acceptedAt?: Date;
    acceptedBy?: string;
    acceptedVia?: string; // e.g., 'MANUAL', 'E_SIGN'
}

export interface AgreementAcceptanceRecord {
    acceptanceId: string;
    agreementId: string;
    agreementVersion: number;
    actorId: string;
    actorType: 'CLIENT' | 'LEGAL_REPRESENTATIVE';
    timestamp: Date;
    method: string;
    evidenceReference?: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface AgreementFingerprint {
    price: number;
    setupFee: number;
    recurringFee: number;
    commercialModel: string;
    billingCycle: string;
    minimumCommitment: number;
    paymentTerms: string;
    solutionVersion: string;
    requirementsVersion?: string;
    proposalHash: string;
}
