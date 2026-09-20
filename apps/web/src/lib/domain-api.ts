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
};
