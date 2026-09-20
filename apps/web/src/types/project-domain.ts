/**
 * @file project-domain.ts
 * @description Domain types for Project Delivery operations.
 */

import { ProjectStatus } from '@/types/commercial'; // Reusing if already there or defined separately

export interface Project {
  id: string;
  contractId: string;
  name: string;
  status: string;
  paymentStatus: string;
  paymentVerifiedAt?: Date;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
}

export interface DeliveryPlan {
  planId: string;
  projectId: string;
  solutionArchitectureId: string;
  solutionVersionId: string;
  workflowVersionId: string;
  planVersion: number;
  status: string;
  planningRulesVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  milestoneId: string;
  planId: string;
  type: string;
  title: string;
  description: string;
  orderIndex: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTask {
  taskId: string;
  projectId: string;
  planId: string;
  milestoneId: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  priority: string;
  owner: string;
  dueDate?: Date;
  completedAt?: Date;
}

export interface ScopeBaseline {
  scopeBaselineId: string;
  projectId: string;
  confirmationId: string;
  solutionVersionId: string;
  deliveryPlanVersionId: string;
  version: number;
  status: string;
  createdAt: Date;
}

export interface ScopeItem {
  scopeItemId: string;
  scopeBaselineId: string;
  sourceRequirementId: string;
  title: string;
  description: string;
  classification: string;
  priority: string;
  notes?: string;
}

export interface ChangeRequest {
  changeRequestId: string;
  projectId: string;
  scopeBaselineId: string;
  title: string;
  description: string;
  reason: string;
  classification: string;
  status: string;
  technicalImpact: string;
  commercialImpact: string;
  scheduleImpact: string;
  riskLevel: string;
}

export interface ReviewSession {
  reviewSessionId: string;
  projectId: string;
  scopeBaselineId: string;
  deliveryPlanVersionId: string;
  status: string;
  reviewVersion: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ReviewFinding {
  findingId: string;
  reviewSessionId: string;
  description: string;
  severity: string;
  status: string;
}

export interface Handover {
  handoverId: string;
  projectId: string;
  status: string;
  handoverVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HandoverItem {
  handoverItemId: string;
  handoverId: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
  status: string;
}
