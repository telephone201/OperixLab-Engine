/**
 * @file matching.ts
 * @description Types for the Matching Review Surface (STEP 6 read path).
 * 1:1 mirror of the verified backend DTO returned by
 * GET /leads/:id/matching/sessions/:sessionId (matching-read-service.ts).
 * Nullability matches the backend implementation exactly; no UI-only state
 * fields, no invented fields, no reviewReason (documented non-goal).
 */

/** READ-ONLY workflow_library metadata for one candidate. The whole object
 * is null when the referenced workflow_library row no longer exists. */
export interface MatchingCandidateWorkflow {
  name: string | null;
  description: string | null;
  integrations: string[];
  triggers: string[];
  qualityScore: number | null;
  category: string | null;
}

/** Genuine RequirementCoverageAnalyzer output persisted per candidate.
 * isMustRequirement is the persisted priority projection
 * (priority === 'MUST'); SHOULD remains informational only. */
export interface MatchingRequirementCoverage {
  requirementId: string;
  coverageLevel: string;
  evidence: string | null;
  confidence: number | null;
  isMustRequirement: boolean;
}

/** Persisted hard-gate result row (workflow_compatibility_checks).
 * result is PASS / FAIL / UNKNOWN — UNKNOWN is NOT a failure. */
export interface MatchingGateResult {
  gateType: string;
  result: string;
  details: string | null;
}

/** Requirement context for the session's analysis. Priority is
 * informational only (product decision Option A). */
export interface MatchingRequirementContext {
  id: string;
  title: string | null;
  description: string | null;
  priority: string | null;
}

/** Existing candidate fields plus the review-surface evidence extensions. */
export interface MatchingCandidateDetail {
  id: string;
  workflowId: string;
  matchScore: number | null;
  rank: number | null;
  status: string;
  reasoning: string | null;
  workflow: MatchingCandidateWorkflow | null;
  coverage: MatchingRequirementCoverage[];
  gates: MatchingGateResult[];
}

/** Session decision/state (workflow_match_sessions row). */
export interface MatchingDecision {
  status: string;
  strategy: string | null;
  overallConfidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Persisted solution_architectures artifact. blueprint is the JSONB
 * written by persistDecision (strategy, primaryCandidateId, reasoning,
 * evidence, rejectedStrategies, candidateSummary, ...) — kept open. */
export interface MatchingArchitecture {
  id: string;
  status: string;
  version: number;
  approvedBy: string | null;
  approvedAt: Date | null;
  blueprint: Record<string, unknown> | null;
}

/** Recommendation mapped ONLY from the persisted blueprint. */
export interface MatchingRecommendation {
  strategy: string | null;
  primaryCandidateId: string | null;
  reasoning: string | null;
  evidence: string | null;
}

/** OPTION B: the session status is the authoritative review decision.
 * decidedBy/decidedAt exist for APPROVED only (rejection maps to nulls). */
export interface MatchingReview {
  reviewOutcome: 'APPROVED' | 'REJECTED' | null;
  decidedBy: string | null;
  decidedAt: Date | null;
}

/** Full matching session detail response. */
export interface MatchingSessionDetail {
  sessionId: string;
  leadId: string;
  requirementsAnalysisId: string;
  decision: MatchingDecision;
  architecture: MatchingArchitecture | null;
  recommendation: MatchingRecommendation;
  review: MatchingReview;
  candidates: MatchingCandidateDetail[];
  requirements: MatchingRequirementContext[];
}
