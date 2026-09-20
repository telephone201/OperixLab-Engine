/**
 * @file payment-types.ts
 * @description Domain types for Payments and Payment Readiness.
 */

import { PaymentStatus } from './types';

export enum PaymentPurpose {
    SETUP_FEE = 'SETUP_FEE',
    FIRST_MONTHLY = 'FIRST_MONTHLY',
    REMAINING_SETUP_BALANCE = 'REMAINING_SETUP_BALANCE',
    RECURRING_PAYMENT = 'RECURRING_PAYMENT',
    OTHER = 'OTHER'
}

export interface Payment {
    paymentId: string;
    agreementId: string;
    proposalId: string;
    offerOptionId: string;
    expectedAmount: number;
    verifiedAmount: number;
    currency: string;
    purpose: PaymentPurpose;
    status: PaymentStatus; // Uses existing PaymentStatus from types.ts
    submittedAmount?: number;
    clientReference?: string;
    evidenceReference?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

export enum PaymentReadinessStatus {
    NOT_READY = 'NOT_READY',
    PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
    PAYMENT_SUBMITTED = 'PAYMENT_SUBMITTED',
    PENDING_VERIFICATION = 'PENDING_VERIFICATION',
    PARTIALLY_VERIFIED = 'PARTIALLY_VERIFIED',
    VERIFIED = 'VERIFIED',
    REJECTED = 'REJECTED',
    FAILED = 'FAILED',
    BLOCKED = 'BLOCKED'
}

export interface PaymentReadiness {
    proposalId: string;
    agreementId: string;
    status: PaymentReadinessStatus;
    lastEvaluatedAt: Date;
    verifiedAmountTotal: number;
    requiredAmountTotal: number;
    details: Record<string, any>;
}
