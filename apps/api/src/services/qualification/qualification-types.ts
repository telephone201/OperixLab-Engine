/**
 * @file qualification-types.ts
 * @description Core types for the Qualification and Scoring system.
 */

export interface ScoreComponent {
    componentName: string;
    raw_value: string;
    score: number;
    max_score: number;
    confidence: number;
    reasoning: string;
    evidence_ids: string[];
    is_overridden: boolean;
    override_score?: number;
    override_reason?: string;
}

export interface QualificationResult {
    leadId: string;
    totalScore: number;
    maxScore: number;
    threshold: number;
    qualified: boolean;
    label: 'PRIORITY_A' | 'PRIORITY_B' | 'NURTURE' | 'REJECT';
    components: ScoreComponent[];
    version: number;
    calculatedAt: Date;
}

export interface IntentState {
    state: 'NO_SIGNAL' | 'LOW_INTENT' | 'WARM' | 'HOT' | 'READY_TO_BUY';
    score: number;
    confidence: number;
    lastUpdated: Date;
}
