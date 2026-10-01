/**
 * @file matching-api.ts
 * @description Domain-specific API functions for the Matching Review Surface.
 * Wraps the existing backend read/review endpoints exactly as implemented
 * (no invented fields, no reviewReason, no role/handoff data). Timestamps
 * arrive as ISO strings over JSON (the shared apiClient does not
 * deserialize dates); they are converted to Date at this boundary to match
 * the declared matching types — the only place that mapping happens.
 */

import { apiClient } from '@/lib/api-client';
import {
  MatchingSessionDetail,
  MatchingDecision,
  MatchingReview
} from '@/types/matching';

/** Summary architecture row (detail payload omitted on list reads). */
export interface MatchingArchitectureSummary {
  id: string;
  status: string;
  version: number;
  approvedBy: string | null;
  approvedAt: Date | null;
}

/** One workflow_match_sessions row as returned by the list endpoint. */
export interface MatchingSessionListItem {
  sessionId: string;
  leadId: string;
  requirementsAnalysisId: string;
  decision: MatchingDecision;
  architecture: MatchingArchitectureSummary | null;
  review: MatchingReview;
}

/** Result of POST /matching/review/:sessionId/approve|reject. */
export interface MatchingReviewDecisionResult {
  sessionId: string;
  decision: 'APPROVED' | 'REJECTED';
  strategy: string | null;
  decidedBy: string;
  decidedAt: Date;
  /** Audit-only reviewer note, echoed from the backend (null when absent). */
  reason: string | null;
}

/** ISO-string -> Date (null-safe) for known timestamp fields. */
function toDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }

  return new Date(String(value));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSummaryArchitecture(raw: any): MatchingArchitectureSummary | null {
  if (!raw) {
    return null;
  }

  return {
    id: String(raw.id),
    status: String(raw.status),
    version: raw.version == null ? 1 : Number(raw.version),
    approvedBy: raw.approvedBy ?? null,
    approvedAt: toDate(raw.approvedAt)
  };
}

function mapReview(raw: any): MatchingReview {
  return {
    reviewOutcome: raw?.reviewOutcome ?? null,
    decidedBy: raw?.decidedBy ?? null,
    decidedAt: toDate(raw?.decidedAt)
  };
}

function mapListSession(raw: any): MatchingSessionListItem {
  return {
    sessionId: String(raw.sessionId),
    leadId: String(raw.leadId),
    requirementsAnalysisId: String(raw.requirementsAnalysisId),
    decision: {
      status: String(raw.decision?.status ?? ''),
      strategy: raw.decision?.strategy ?? null,
      overallConfidence:
        raw.decision?.overallConfidence == null
          ? null
          : Number(raw.decision.overallConfidence),
      createdAt: toDate(raw.decision?.createdAt) ?? new Date(0),
      updatedAt: toDate(raw.decision?.updatedAt) ?? new Date(0)
    },
    architecture: mapSummaryArchitecture(raw.architecture),
    review: mapReview(raw.review)
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const matchingApi = {
  /**
   * GET /api/leads/:leadId/matching
   * All persisted matching sessions for a lead, newest first (summary rows:
   * no candidates, no blueprint payload, no review evidence).
   */
  async getLeadMatchingSessions(
    leadId: string
  ): Promise<{ data: MatchingSessionListItem[] | null; error?: any }> {
    const response = await apiClient.get<any[]>(`/leads/${leadId}/matching`);

    return {
      data: response.data ? response.data.map(mapListSession) : null,
      error: response.error
    };
  },

  /**
   * GET /api/leads/:leadId/matching/sessions/:sessionId
   * Full review surface for one session (decision, architecture + blueprint,
   * recommendation, review outcome, candidates with workflow/coverage/gates,
   * requirement context). Lead-scoped server-side.
   */
  async getMatchingSessionDetail(
    leadId: string,
    sessionId: string
  ): Promise<{ data: MatchingSessionDetail | null; error?: any }> {
    const response = await apiClient.get<MatchingSessionDetail>(
      `/leads/${leadId}/matching/sessions/${sessionId}`
    );

    if (!response.data) {
      return { data: null, error: response.error };
    }

    const raw = response.data as any;

    // Minimal boundary mapping: only the declared Date fields change;
    // everything else passes through exactly as the backend sent it.
    const detail: MatchingSessionDetail = {
      ...raw,
      decision: {
        ...raw.decision,
        createdAt: toDate(raw.decision?.createdAt) ?? new Date(0),
        updatedAt: toDate(raw.decision?.updatedAt) ?? new Date(0)
      },
      architecture: raw.architecture
        ? {
            ...raw.architecture,
            approvedAt: toDate(raw.architecture.approvedAt)
          }
        : null,
      review: mapReview(raw.review)
    };

    return { data: detail, error: response.error };
  },

  /**
   * POST /api/matching/review/:sessionId/approve
   * OWNER/OPERATOR only (server-enforced). No body required; the backend's
   * optional reason field is audit-only and intentionally not sent here.
   */
  async approveMatch(
    sessionId: string
  ): Promise<{ data: MatchingReviewDecisionResult | null; error?: any }> {
    const response = await apiClient.post<any>(
      `/matching/review/${sessionId}/approve`
    );

    return { data: response.data ? mapDecisionResult(response.data) : null, error: response.error };
  },

  /**
   * POST /api/matching/review/:sessionId/reject
   * OWNER/OPERATOR only (server-enforced). Session becomes REJECTED; the
   * solution architecture intentionally remains DRAFT (Option B).
   */
  async rejectMatch(
    sessionId: string
  ): Promise<{ data: MatchingReviewDecisionResult | null; error?: any }> {
    const response = await apiClient.post<any>(
      `/matching/review/${sessionId}/reject`
    );

    return { data: response.data ? mapDecisionResult(response.data) : null, error: response.error };
  },

  /**
   * POST /api/leads/:leadId/matching/run
   * Executes workflow matching for the lead's latest requirements analysis.
   */
  async runMatching(
    leadId: string
  ): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post<any>(
      `/leads/${leadId}/matching/run`,
      {}
    );

    return response;
  },

  /**
   * POST /api/leads/:leadId/matching/sessions/:sessionId/handoff
   * Converts an APPROVED matching session into a DRAFT commercial package and proposal.
   */
  async handoffToCommercial(
    leadId: string,
    sessionId: string,
    currency: string = 'EGP'
  ): Promise<{ data: any | null; error?: any }> {
    const response = await apiClient.post<any>(
      `/leads/${leadId}/matching/sessions/${sessionId}/handoff`,
      { currency }
    );

    return response;
  }
};

function mapDecisionResult(raw: any): MatchingReviewDecisionResult {
  return {
    sessionId: String(raw.sessionId),
    decision: raw.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    strategy: raw.strategy ?? null,
    decidedBy: String(raw.decidedBy ?? ''),
    decidedAt: toDate(raw.decidedAt) ?? new Date(0),
    reason: raw.reason ?? null
  };
}
