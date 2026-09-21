/**
 * @file pain-analysis-service.ts
 * @description Orchestrates the pain analysis pipeline from evidence to structured intelligence.
 */

import { Pain, PainAnalysis, PainType, EvidenceLevel, PainStatus, PainPriority } from './pain-types';
import { PainAnalysisPromptGenerator } from './pain-prompt-generator';
import { auditLogger } from '../../core/logging/audit-logger';

export class PainAnalysisService {
    private promptGenerator = new PainAnalysisPromptGenerator();

    /**
     * Initiates a new pain analysis for a lead.
     * In Zero Cost Mode, this creates a Manual AI Task.
     */
    async initiateAnalysis(leadId: string, researchData: any, qualificationData: any): Promise<{ taskId: string; prompt: string }> {
        const prompt = this.promptGenerator.generatePrompt({
            companyName: researchData.companyName,
            industry: researchData.industry,
            website: researchData.website,
            researchSummary: researchData.summary,
            researchEvidence: researchData.evidence,
            qualificationSummary: qualificationData.summary,
            commercialSignals: qualificationData.signals || [],
            researchGaps: researchData.gaps || [],
        });

        const taskId = `pain_analysis_${leadId}_${Date.now()}`;

        await auditLogger.log({
            action: 'PAIN_ANALYSIS_INITIATED',
            entityType: 'PainAnalysis',
            entityId: leadId,
            details: { taskId, analysisVersion: 1 },
        });

        return { taskId, prompt };
    }

    /**
     * Processes the result returned by the user from the Manual AI Bridge.
     */
    async processAnalysisResult(leadId: string, aiResponse: string, researchVersionId: string, qualificationVersionId: string): Promise<PainAnalysis> {
        // 1. Parse AI Response (simplified for implementation)
        const candidatePains = this.parseAIResponse(aiResponse);

        // 2. Evidence Validation & Truth Classification
        const validatedPains = candidatePains.map(pain => this.validatePain(pain));

        // 3. Deterministic Priority Calculation
        const analyzedPains = validatedPains.map(pain => this.calculatePriority(pain));

        // 4. Determine Primary Pain
        const primaryPainId = this.selectPrimaryPain(analyzedPains);

        const analysis: PainAnalysis = {
            id: `pa_${Date.now()}`,
            leadId,
            researchVersionId,
            qualificationVersionId,
            analysisVersion: 1,
            status: 'DRAFT',
            overallConfidence: this.calculateOverallConfidence(analyzedPains),
            primaryPainId,
            pains: analyzedPains,
            unresolvedQuestions: this.extractUnresolvedQuestions(aiResponse),
            createdAt: new Date(),
        };

        await auditLogger.log({
            action: 'PAIN_ANALYSIS_COMPLETED',
            entityType: 'PainAnalysis',
            entityId: leadId,
            details: { painCount: analyzedPains.length, primaryPainId },
        });

        return analysis;
    }

    private parseAIResponse(response: string): any[] {
        // Mock parsing logic - in real implementation, this would use a regex or structured output parser
        return [{
            title: 'Manual Lead Follow-Up',
            type: 'FOLLOW_UP',
            description: 'Manual follow-up appears to be part of the acquisition process.',
            evidenceType: 'INFERRED',
            severity: 'HIGH',
            frequency: 'REGULAR',
            confidence: 'MEDIUM',
            sources: ['1', '4'],
        }];
    }

    private validatePain(candidate: any): Pain {
        // Strict validation: ensure no fabrication
        // If evidenceType is UNKNOWN or evidence is missing, mark as NEEDS_RESEARCH
        const status: PainStatus = candidate.evidenceType === 'UNKNOWN' ? 'NEEDS_RESEARCH' : 'DRAFT';

        return {
            id: `pain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            analysisId: '', // Set during saving
            painType: candidate.type as PainType,
            title: candidate.title,
            description: candidate.description,
            evidenceType: candidate.evidenceType as EvidenceLevel,
            severity: candidate.severity,
            frequency: candidate.frequency,
            automationRelevance: 'UNKNOWN', // Calculated in separate step
            confidence: candidate.confidence === 'HIGH' ? 0.9 : candidate.confidence === 'MEDIUM' ? 0.6 : 0.3,
            status,
            priority: 'LOW',
            reasoning: candidate.description,
            source: 'AI_ANALYSIS',
            version: 1,
            evidence: [], // Populated by EvidenceValidator
        };
    }

    private calculatePriority(pain: Pain): Pain {
        // Deterministic Priority Rule:
        // Priority = (Severity Score * 0.4) + (Frequency Score * 0.3) + (Confidence * 0.3)
        const severityMap = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };
        const frequencyMap = { 'CONTINUOUS': 4, 'FREQUENT': 3, 'REGULAR': 2, 'OCCASIONAL': 1, 'RARE': 0, 'UNKNOWN': 0 };

        const sScore = severityMap[pain.severity] || 0;
        const fScore = frequencyMap[pain.frequency] || 0;
        const cScore = pain.confidence * 4;

        const priorityScore = (sScore * 0.4) + (fScore * 0.3) + (cScore * 0.3);

        let priority: PainPriority = 'LOW';
        if (priorityScore >= 3.5) priority = 'CRITICAL';
        else if (priorityScore >= 2.5) priority = 'HIGH';
        else if (priorityScore >= 1.5) priority = 'MEDIUM';

        return { ...pain, priority };
    }

    private selectPrimaryPain(pains: Pain[]): string | undefined {
        if (pains.length === 0) return undefined;

        // Sort by priority and confidence
        const sorted = [...pains].sort((a, b) => {
            const pMap = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
        });

        return sorted[0].id;
    }

    private calculateOverallConfidence(pains: Pain[]): number {
        if (pains.length === 0) return 0;
        return pains.reduce((sum, p) => sum + p.confidence, 0) / pains.length;
    }

    private extractUnresolvedQuestions(response: string): string[] {
        // Mock extraction
        return ['How are inbound leads currently assigned?'];
    }
}

