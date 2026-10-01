/**
 * @file pain-analysis-service.ts
 * @description Orchestrates the pain analysis pipeline from evidence to structured intelligence.
 */

import { Pain, PainAnalysis, PainType, EvidenceLevel } from './pain-types';
import { PainAnalysisPromptGenerator } from './pain-prompt-generator';
import { auditLogger } from '../../core/logging/audit-logger';
import { PainEvidenceValidator } from './pain-evidence-validator';
import { PainPriorityCalculator } from './pain-priority-calculator';
import { painVersionManager } from './pain-version-manager';
import { ManualAIProvider, manualAITaskService } from '../manual-ai/manual-ai-task-service';

export class PainAnalysisService {
    private promptGenerator = new PainAnalysisPromptGenerator();
    private evidenceValidator = new PainEvidenceValidator();
    private priorityCalculator = new PainPriorityCalculator();
    private versionManager = painVersionManager;

    async initiateAnalysis(
        leadId: string,
        researchData: any,
        qualificationData: any,
        provider: ManualAIProvider,
        versionIdentity?: {
            researchVersionId?: string | null;
            qualificationVersionId?: string | null;
        }
    ): Promise<{ taskId: string; prompt: string }> {
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

        const task = await manualAITaskService.createTask({
            leadId,
            taskType: 'PAIN_ANALYSIS',
            provider,
            prompt,
            versionIdentity,
        });

        await auditLogger.log({
            action: 'PAIN_ANALYSIS_INITIATED',
            entityType: 'PainAnalysis',
            entityId: leadId,
            details: {
                taskId: task.id,
                analysisVersion: 1,
                provider,
            },
        });

        return {
            taskId: task.id,
            prompt: task.prompt,
        };
    }

    async processAnalysisResult(
        leadId: string,
        aiResponse: string,
        researchVersionId: string,
        qualificationVersionId: string,
        researchEvidence: any[] = [],
        taskId?: string
    ): Promise<PainAnalysis> {
        console.log('[PAIN_DEBUG_RUNTIME]', JSON.stringify({
            responseStart: aiResponse.slice(0, 120),
            responseLength: aiResponse.length,
            noSupportedMatch: /^\s*NO_SUPPORTED_PAINS\b/i.test(aiResponse)
        }));

        const candidatePains = this.parseAIResponse(aiResponse, researchEvidence);

        console.log('[PAIN_DEBUG_PARSED]', JSON.stringify({
            candidatePainCount: candidatePains.length,
            firstCandidate: candidatePains[0] ?? null
        }));

        const validatedPains = candidatePains.map(candidate => {
            const pain = this.validatePain(candidate);
            return this.evidenceValidator.validate(pain, researchEvidence).validatedPain;
        });

        const analyzedPains = validatedPains.map(pain =>
            this.calculatePriority(pain)
        );

        const primaryPainId = this.selectPrimaryPain(analyzedPains);

        const analysis: PainAnalysis = {
            id: `pa_${Date.now()}`,
            leadId,
            researchVersionId,
            qualificationVersionId,
            analysisVersion: 1,
            status:
                analyzedPains.some(pain => pain.status === 'NEEDS_RESEARCH')
                    ? 'NEEDS_RESEARCH'
                    : analyzedPains.some(pain => pain.status === 'REVIEW_REQUIRED')
                        ? 'REVIEW_REQUIRED'
                        : analyzedPains.length > 0 &&
                            analyzedPains.every(pain => pain.status === 'SUPPORTED')
                            ? 'SUPPORTED'
                            : 'DRAFT',
            overallConfidence: this.calculateOverallConfidence(analyzedPains),
            primaryPainId,
            pains: analyzedPains,
            unresolvedQuestions: this.extractUnresolvedQuestions(aiResponse),
            createdAt: new Date(),
        };

        // When the originating manual AI task is provided, its idempotency
        // guards, validation and task correlation (pain_analysis_id, version
        // IDs, REVIEWED status) run inside the same transaction as the Pain
        // persistence (PainVersionManager.saveVersion).
        const savedAnalysis = await this.versionManager.saveVersion(
            analysis,
            taskId ? { taskId } : undefined
        );

        await auditLogger.log({
            action: 'PAIN_ANALYSIS_COMPLETED',
            entityType: 'PainAnalysis',
            entityId: savedAnalysis.id,
            details: {
                ...(taskId ? { taskId } : {}),
                painCount: savedAnalysis.pains.length,
                primaryPainId: savedAnalysis.primaryPainId,
                unresolvedPainCount: savedAnalysis.pains.filter(
                    pain => pain.status === 'NEEDS_RESEARCH'
                ).length,
                analysisVersion: savedAnalysis.analysisVersion,
            },
        });

        return savedAnalysis;
    }

    private parseAIResponse(response: string, researchEvidence: any[]): any[] {
        // Explicit negative result: the AI found no evidence-supported pain.
        // This must not be converted into a fabricated "Unstructured Pain Analysis"
        // or a NEEDS_RESEARCH pain. An empty pain set is a valid analysis outcome.
        if (/^\s*NO_SUPPORTED_PAINS\b/i.test(response)) {
            return [];
        }

        const blocks = response
            .split(/\n\s*(?=-?\s*(?:TITLE|PAIN)\s*:)/i)
            .map(block => block.trim())
            .filter(Boolean);

        if (blocks.length === 0) {
            return [{
                title: 'Unstructured Pain Analysis',
                type: 'UNKNOWN',
                description: 'The AI response did not contain a recognized structured pain entry.',
                evidenceType: 'UNKNOWN',
                severity: 'UNKNOWN',
                frequency: 'UNKNOWN',
                confidence: 'LOW',
                sources: [],
            }];
        }

        const parsed = blocks.map(block => {
            const read = (label: string): string => {
                const pattern = new RegExp(
                    `${label}\\s*:\\s*(.+?)(?=\\n\\s*[A-Z][A-Z ]+\\s*:|$)`,
                    'is'
                );
                return (block.match(pattern)?.[1] || '').trim();
            };

            const sourceText = read('SOURCES');
            const sourceIndexes = [...sourceText.matchAll(/\d+/g)]
                .map(match => Number(match[0]))
                .filter(index => Number.isInteger(index) && index >= 0);

            const contradictorySourceText = read('CONTRADICTORY SOURCES');
            const contradictorySourceIndexes = [...contradictorySourceText.matchAll(/\d+/g)]
                .map(match => Number(match[0]))
                .filter(index => Number.isInteger(index) && index >= 0);

            return {
                title: read('TITLE') || 'Unnamed pain',
                type: (read('CATEGORY') || 'UNKNOWN').toUpperCase(),
                description: read('DESCRIPTION') || 'No evidence-backed description provided.',
                evidenceType: (read('EVIDENCE TYPE') || 'UNKNOWN').toUpperCase(),
                severity: (read('SEVERITY') || 'UNKNOWN').toUpperCase(),
                frequency: (read('FREQUENCY') || 'UNKNOWN').toUpperCase(),
                confidence: (read('CONFIDENCE') || 'LOW').toUpperCase(),
                sources: [
                    ...sourceIndexes
                        .filter(index => Boolean(researchEvidence[index]?.id))
                        .map(index => ({
                            evidenceId: researchEvidence[index].id,
                            contributionType: 'SUPPORTING' as const,
                        })),
                    ...contradictorySourceIndexes
                        .filter(index => Boolean(researchEvidence[index]?.id))
                        .map(index => ({
                            evidenceId: researchEvidence[index].id,
                            contributionType: 'CONTRADICTORY' as const,
                        })),
                ],
            };
        });

        return parsed;
    }

    private validatePain(candidate: any): Pain {
        const confidence =
            candidate.confidence === 'HIGH'
                ? 0.9
                : candidate.confidence === 'MEDIUM'
                    ? 0.6
                    : 0.3;

        const evidence = Array.isArray(candidate.sources)
            ? candidate.sources
            : [];

        const status =
            candidate.evidenceType === 'UNKNOWN' || evidence.length === 0
                ? 'NEEDS_RESEARCH'
                : 'DRAFT';

        return {
            id: `pain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            analysisId: '',
            painType: candidate.type as PainType,
            title: candidate.title,
            description: candidate.description,
            evidenceType: candidate.evidenceType as EvidenceLevel,
            severity: candidate.severity,
            frequency: candidate.frequency,
            automationRelevance: 'UNKNOWN',
            confidence,
            status,
            priority: 'LOW',
            reasoning: candidate.description,
            source: 'AI_ANALYSIS',
            version: 1,
            evidence,
        };
    }

    private calculatePriority(pain: Pain): Pain {
        return {
            ...pain,
            priority: this.priorityCalculator.calculatePriority(pain),
        };
    }

    private selectPrimaryPain(pains: Pain[]): string | undefined {
        if (pains.length === 0) return undefined;

        const priorityMap = {
            CRITICAL: 4,
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
        };

        const sorted = [...pains].sort((a, b) => {
            const priorityDifference =
                (priorityMap[b.priority] || 0) -
                (priorityMap[a.priority] || 0);

            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return b.confidence - a.confidence;
        });

        return sorted[0].id;
    }

    private calculateOverallConfidence(pains: Pain[]): number {
        if (pains.length === 0) return 0;
        return pains.reduce((sum, pain) => sum + pain.confidence, 0) / pains.length;
    }

    private extractUnresolvedQuestions(response: string): string[] {
        const unknownSection = response.match(
            /UNKNOWNs?\s*:\s*([\s\S]*?)(?=\n\s*[A-Z][A-Z ]+\s*:|$)/i
        );

        if (!unknownSection?.[1]) {
            return [];
        }

        return unknownSection[1]
            .split(/\n|;/)
            .map(question => question.replace(/^[-*]\s*/, '').trim())
            .filter(Boolean);
    }
}

export const painAnalysisService = new PainAnalysisService();


