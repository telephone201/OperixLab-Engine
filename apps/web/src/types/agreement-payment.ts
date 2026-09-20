/**
 * @file agreement-payment.ts
 * @description Domain types for Agreement and Payment flow.
 */

import { AgreementStatus } from '@/types/commercial'; // Assuming shared status
import { PaymentStatus } from '@/types/commercial'; // Update to match actual

export interface CommercialAgreement {
  agreementId: string;
  commercialPackageId: string;
  offerOptionId: string;
  proposalVersionId: string;
  solutionVersionId: string;
  companyId: string;
  contactId?: string;
  status: string;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
}

export interface Payment {
  paymentId: string;
  agreementId: string;
  proposalId: string;
  offerOptionId: string;
  expectedAmount: number;
  verifiedAmount: number;
  currency: string;
  purpose: string;
  status: 'REQUIRED' | 'PARTIAL' | 'VERIFIED' | 'PENDING';
  submittedAmount?: number;
  clientReference?: string;
  evidenceReference?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDestination {
  identifier: string;
  url: string;
  instructions?: string;
}

export interface PaymentReadiness {
  proposalId: string;
  agreementId: string;
  status: string;
  lastEvaluatedAt: Date;
  verifiedAmountTotal: number;
  requiredAmountTotal: number;
  details: Record<string, any>;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}
