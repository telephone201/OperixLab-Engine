/**
 * @file domain.ts
 * @description Domain types for the Acquisition & Intelligence workspace.
 * These types mirror the API responses from the Commercialization Bridge.
 */

export interface Lead {
  id: string;
  company: string;
  contact: string;
  source: string;
  status: string;
  created_at: string;
  qualification_state?: string;
}

export interface ResearchEvidence {
  claim: string;
  source: string;
  confidence: number;
  truth_status: 'OBSERVED' | 'INFERRED' | 'UNKNOWN';
  url?: string;
}

export interface LeadResearch {
  requestId: string;
  status: string;
  evidence: ResearchEvidence[];
  summary: string;
}

export interface QualificationComponent {
  name: string;
  score: number;
  weight: number;
}

export interface IntentState {
  state: string;
  score: number;
  confidence: number;
}

export interface LeadQualification {
  score: number;
  maxScore: number;
  label: string;
  components: QualificationComponent[];
  intent: IntentState | null;
}

export interface PainItem {
  id: string;
  description: string;
  type: 'PRIMARY' | 'SECONDARY';
  evidence: string;
  certainty: number;
  truth_status: 'OBSERVED' | 'INFERRED' | 'UNKNOWN';
}

export interface LeadPain {
  overallConfidence: number;
  primaryPainId: string;
  pains: PainItem[];
  unresolvedQuestions: string[];
}

export interface RequirementItem {
  description: string;
  priority: 'MUST' | 'SHOULD' | 'COULD';
  source: string;
  confidence: number;
  status: string;
}

export interface LeadRequirements {
  overallCompleteness: number;
  overallConfidence: number;
  requirements: RequirementItem[];
  unresolvedQuestions: string[];
}
