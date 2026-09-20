/**
 * @file project-api.ts
 * @description Domain-specific API functions for Project Delivery.
 */

import { apiClient } from '@/lib/api-client';
import {
  Project,
  DeliveryPlan,
  Milestone,
  ProjectTask,
  ScopeBaseline,
  ScopeItem,
  ChangeRequest,
  ReviewSession,
  ReviewFinding,
  Handover,
  HandoverItem
} from '@/types/project-domain';

export const projectApi = {
  /**
   * GET /api/projects
   */
  async getProjects(): Promise<{ data: Project[] | null; error?: any }> {
    const response = await apiClient.get<Project[]>('/projects');
    return response;
  },

  /**
   * GET /api/projects/:projectId
   */
  async getProjectDetail(projectId: string): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.get<any>(`/projects/${projectId}`);
    return response;
  },

  /**
   * GET /api/projects/:projectId/plan
   */
  async getDeliveryPlan(projectId: string): Promise<{ data: { plan: DeliveryPlan, milestones: Milestone[], tasks: ProjectTask[] } | null; error?: any }> {
    const response = await apiClient.get<any>(`/projects/${projectId}/plan`);
    return response;
  },

  /**
   * GET /api/projects/:projectId/scope
   */
  async getScope(projectId: string): Promise<{ data: { baseline: ScopeBaseline, items: ScopeItem[], changeRequests: ChangeRequest[] } | null; error?: any }> {
    const response = await apiClient.get<any>(`/projects/${projectId}/scope`);
    return response;
  },

  /**
   * GET /api/projects/:projectId/review
   */
  async getReview(projectId: string): Promise<{ data: { session: ReviewSession, items: any[], findings: ReviewFinding[], feedback: any[] } | null; error?: any }> {
    const response = await apiClient.get<any>(`/projects/${projectId}/review`);
    return response;
  },

  /**
   * GET /api/projects/:projectId/handover
   */
  async getHandover(projectId: string): Promise<{ data: { handover: Handover, items: HandoverItem[] } | null; error?: any }> {
    const response = await apiClient.get<any>(`/projects/${projectId}/handover`);
    return response;
  },

  /**
   * POST /api/projects/transition
   */
  async transitionProject(params: { projectId: string, toState: string, reason: string, actorId: string }): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post('/projects/transition', params);
    return response;
  },
};
