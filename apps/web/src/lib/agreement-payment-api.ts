/**
 * @file agreement-payment-api.ts
 * @description Domain-specific API functions for Agreement and Payment management.
 */

import { apiClient } from '@/lib/api-client';
import {
  CommercialAgreement,
  Payment,
  PaymentDestination,
  PaymentReadiness,
  EligibilityResult
} from '@/types/agreement-payment';

export interface AgreementContext {
  agreement: CommercialAgreement;
  payments: Payment[];
  readiness: PaymentReadiness;
}

export const agreementPaymentApi = {
  /**
   * GET /api/commercial/leads/:leadId/agreement
   */
  async getAgreementContext(leadId: string): Promise<{ data: AgreementContext | null; error?: any }> {
    const response = await apiClient.get<AgreementContext>(`/commercial/leads/${leadId}/agreement`);
    return response;
  },

  /**
   * GET /api/commercial/payment-destinations
   */
  async getPaymentDestinations(): Promise<{ data: PaymentDestination[] | null; error?: any }> {
    const response = await apiClient.get<PaymentDestination[]>('/commercial/payment-destinations');
    return response;
  },

  /**
   * POST /api/commercial/payments/submit
   */
  async submitPayment(params: {
    paymentId: string;
    submittedAmount: number;
    clientReference: string;
    evidenceRef?: string
  }): Promise<{ data: Payment | null; error?: any }> {
    const response = await apiClient.post<Payment>('/commercial/payments/submit', params);
    return response;
  },

  /**
   * POST /api/commercial/payments/verify
   */
  async verifyPayment(params: {
    paymentId: string;
    verifiedAmount: number;
    verifiedBy: string;
    decision: 'VERIFY' | 'PARTIALLY_VERIFY' | 'REJECT';
    reason?: string
  }): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post('/commercial/payments/verify', params);
    return response;
  },

  /**
   * GET /api/commercial/leads/:leadId/eligibility
   */
  async checkProjectEligibility(leadId: string): Promise<{ data: EligibilityResult | null; error?: any }> {
    const response = await apiClient.get<EligibilityResult>(`/commercial/leads/${leadId}/eligibility`);
    return response;
  },

  /**
   * POST /api/commercial/projects/start
   */
  async startProject(params: { projectId: string; userId: string }): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post('/commercial/projects/start', params);
    return response;
  },
};
