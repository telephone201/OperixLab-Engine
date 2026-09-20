/**
 * @file commercial-api.ts
 * @description Domain-specific API functions for Commercial Management.
 */

import { apiClient } from '@/lib/api-client';
import {
  CommercialPackage,
  PricingRecommendation,
  OfferOption,
  Proposal,
  ProposalContent,
  StalenessResult
} from '@/types/commercial';

export interface CommercialContext {
  package: CommercialPackage;
  pricing: PricingRecommendation | null;
  offers: OfferOption[];
  proposal: Proposal | null;
}

export interface ProposalPreview {
  content: ProposalContent;
  status: string;
  staleness: StalenessResult;
}

export const commercialApi = {
  /**
   * GET /api/commercial/leads
   * Returns the commercial pipeline overview.
   */
  async getCommercialPipeline(): Promise<{ data: any[] | null; error?: any }> {
    const response = await apiClient.get<any[]>('/commercial/leads');
    return response;
  },

  /**
   * GET /api/commercial/leads/:leadId
   * Returns full commercial context for a lead.
   */
  async getLeadCommercialContext(leadId: string): Promise<{ data: CommercialContext | null; error?: any }> {
    const response = await apiClient.get<CommercialContext>(`/commercial/leads/${leadId}`);
    return response;
  },

  /**
   * GET /api/commercial/leads/:leadId/proposal-preview
   * Returns proposal content and staleness.
   */
  async getProposalPreview(leadId: string): Promise<{ data: ProposalPreview | null; error?: any }> {
    const response = await apiClient.get<ProposalPreview>(`/commercial/leads/${leadId}/proposal-preview`);
    return response;
  },

  /**
   * POST /api/commercial/pricing/approve
   */
  async approvePricing(params: { approvalId: string; userId: string; reason: string }): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post('/commercial/pricing/approve', params);
    return response;
  },

  /**
   * POST /api/commercial/proposal/approve
   */
  async approveProposal(params: { approvalId: string; userId: string; reason: string }): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post('/commercial/proposal/approve', params);
    return response;
  },
};
