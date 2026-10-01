/**
 * @file domain-api.ts
 * @description Domain-specific API functions for the Acquisition & Intelligence workspace.
 */

import { apiClient } from '@/lib/api-client';
import {
  Lead,
  LeadResearch,
  LeadQualification,
  LeadPain,
  LeadRequirements
} from '@/types/domain';

export const domainApi = {
  /**
   * Fetches the list of all leads.
   */
  async getLeads(): Promise<{ data: Lead[] | null; error?: any }> {
    const response = await apiClient.get<Lead[]>('/leads');
    return response;
  },

  /**
   * Fetches a specific lead by ID.
   */
  async getLead(id: string): Promise<{ data: Lead | null; error?: any }> {
    const response = await apiClient.get<Lead>(`/leads/${id}`);
    return response;
  },

  /**
   * Creates a manual AI research task for a specific lead.
   */
  async createResearchTask(
    id: string,
    provider: 'PERPLEXITY' | 'GEMINI'
  ): Promise<{
    data: {
      taskId: string;
      researchRequestId: string;
      provider: 'PERPLEXITY' | 'GEMINI';
      prompt: string;
      status: string;
    } | null;
    error?: any;
  }> {
    return apiClient.post(
      `/leads/${id}/research`,
      { provider }
    );
  },

  /**
   * Fetches the research data for a specific lead.
   */
  async getLeadResearch(id: string): Promise<{ data: LeadResearch | null; error?: any }> {
    const response = await apiClient.get<LeadResearch>(`/leads/${id}/research`);
    return response;
  },

  /**
   * Fetches the qualification data for a specific lead.
   */
  async getLeadQualification(id: string): Promise<{ data: LeadQualification | null; error?: any }> {
    const response = await apiClient.get<LeadQualification>(`/leads/${id}/qualification`);
    return response;
  },

  /**
   * Fetches the pain analysis for a specific lead.
   */
  async getLeadPain(id: string): Promise<{ data: LeadPain | null; error?: any }> {
    const response = await apiClient.get<LeadPain>(`/leads/${id}/pain`);
    return response;
  },

  /**
   * Fetches the requirements analysis for a specific lead.
   */
  async getLeadRequirements(id: string): Promise<{ data: LeadRequirements | null; error?: any }> {
    const response = await apiClient.get<LeadRequirements>(`/leads/${id}/requirements`);
    return response;
  },

  /**
   * Calculates and persists a new qualification score version for a lead.
   */
  async calculateQualification(id: string): Promise<{ data: any | null; error?: any }> {
    return apiClient.post(`/leads/${id}/qualification`, {});
  },

  /**
   * Initiates a pain analysis task for a lead.
   */
  async initiatePain(
    id: string,
    provider: 'PERPLEXITY' | 'GEMINI' = 'PERPLEXITY'
  ): Promise<{ data: any | null; error?: any }> {
    return apiClient.post(`/leads/${id}/pain`, { provider });
  },

  /**
   * Initiates requirements extraction analysis for a lead.
   */
  async initiateRequirements(
    id: string,
    provider: 'PERPLEXITY' | 'GEMINI' = 'PERPLEXITY'
  ): Promise<{ data: any | null; error?: any }> {
    return apiClient.post(`/leads/${id}/requirements`, { provider });
  },

  /**
   * Uploads an external CSV or XLSX lead file via multipart/form-data.
   * Stages rows and creates a mapping review session without auto-creating leads.
   */
  async uploadExternalLeads(
    file: File,
    batchName?: string
  ): Promise<{ data: any | null; error?: any }> {
    const formData = new FormData();
    formData.append('file', file);
    if (batchName) {
      formData.append('batchName', batchName);
    }
    return apiClient.postFormData('/acquisition/upload', formData);
  },

  /**
   * Lists recent external lead ingestion batches.
   */
  async getIngestionBatches(): Promise<{ data: any[] | null; error?: any }> {
    return apiClient.get('/acquisition/batches');
  },

  /**
   * Promotes staged leads from an APPROVED mapping review session to live leads.
   */
  async promoteApprovedBatch(
    batchId: string
  ): Promise<{ data: any | null; error?: any }> {
    return apiClient.post(`/acquisition/batches/${batchId}/promote`, {});
  },

  /**
   * Approves a mapping review session.
   */
  async approveReviewSession(
    sessionId: string
  ): Promise<{ data: any | null; error?: any }> {
    return apiClient.post(`/acquisition/review-sessions/${sessionId}/approve`, {});
  },
};


