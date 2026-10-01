/**
 * @file requirements-analysis-service.ts
 * @description Orchestrates the requirements extraction pipeline.
 */

import { RequirementsAnalysis, Requirement } from './requirement-types';
import { RequirementExtractor } from './requirement-extractor';
import { RequirementValidator } from './requirement-validator';
import { RequirementPromptGenerator } from './requirement-prompt-generator';
import { RequirementClassifier } from './requirement-classifier';
import { RequirementVersionManager } from './requirement-version-manager';
import { auditLogger } from '../../core/logging/audit-logger';
import { db } from '../../lib/db';
import { ManualAIProvider, manualAITaskService } from '../manual-ai/manual-ai-task-service';

export class RequirementsAnalysisService {
    private validator = new RequirementValidator();
    private classifier = new RequirementClassifier();
    private extractor = new RequirementExtractor();
    private promptGenerator = new RequirementPromptGenerator();
    private versionManager = new RequirementVersionManager();

    /**
     * Initiates the requirements extraction process.
     */
    async extractRequirements(
        leadId: string,
        researchData: any,
        painAnalysis: any,
        provider: ManualAIProvider,
        versionIdentity?: {
            researchVersionId?: string | null;
            qualificationVersionId?: string | null;
            painAnalysisId?: string | null;
        },
        taskId?: string
    ): Promise<{ taskId: string; prompt: string }> {
        const prompt = this.promptGenerator.generatePrompt({
            companyName: String(researchData?.companyName || ''),
            industry: String(researchData?.industry || ''),
            website: String(researchData?.website || ''),
            researchSummary: String(researchData?.summary || ''),
            researchEvidence: Array.isArray(researchData?.evidence)
                ? researchData.evidence
                : [],
            painAnalysis: {
                pains: Array.isArray(painAnalysis?.pains)
                    ? painAnalysis.pains
                    : [],
            },
            qualificationSummary: String(
                researchData?.qualificationSummary ||
                researchData?.qualification_summary ||
                ''
            ),
        });

        const task = await manualAITaskService.createTask({
            leadId,
            taskType: 'REQUIREMENTS_EXTRACTION',
            provider,
            prompt,
            versionIdentity,
        });

        await auditLogger.log({
            action: 'REQUIREMENTS_EXTRACTION_INITIATED',
            entityType: 'RequirementsAnalysis',
            entityId: leadId,
            details: {
                taskId: task.id,
                provider,
            },
        });

        return {
            taskId: task.id,
            prompt: task.prompt,
        };
    }

    /**
     * Processes results from the Manual AI Bridge and persists
     * the resulting analysis and requirements atomically.
     */
    async processAnalysisResult(
        leadId: string,
        aiResponse: string,
        researchData: any,
        painAnalysis: any,
        taskId?: string
    ): Promise<RequirementsAnalysis> {
        const candidates = this.extractor.extract(aiResponse);
        const validatedRequirements: Requirement[] = [];

        for (const candidate of candidates) {
            const validation = this.validator.validate(
                candidate,
                researchData?.evidence || []
            );

            if (!validation.isValid) {
                console.log(`[VALIDATOR] Rejected requirement: ${validation.reason}`);
                continue;
            }

            const validatedRequirement = validation.validatedRequirement;

            const sourcePain = (painAnalysis?.pains || []).find(
                (p: any) => p.id === validatedRequirement.sourcePainId
            );

            if (validatedRequirement.sourcePainId && !sourcePain) {
                console.log(`[VALIDATOR] Rejected requirement: sourcePainId does not belong to the supplied pain analysis.`);
                continue;
            }

            const severity = sourcePain?.severity || 'UNKNOWN';
            const signal = 'MEDIUM';

            const { priority, type } = this.classifier.classify(
                validatedRequirement,
                severity,
                signal
            );

            validatedRequirements.push({
                ...validatedRequirement,
                priority,
                type,
                certainty: validation.updatedCertainty,
                status: 'VALIDATED',
            });
        }

        const lead = await db.leads.findUnique({
            where: { id: leadId }
        });

        if (!lead) {
            throw new Error('LEAD_NOT_FOUND');
        }

        const overallConfidence = validatedRequirements.length > 0
            ? validatedRequirements.reduce(
                (sum, requirement) => sum + requirement.confidence,
                0
            ) / validatedRequirements.length
            : 0;

        const overallCompleteness = candidates.length > 0
            ? validatedRequirements.length / candidates.length
            : 0;

        const analysisStatus =
            validatedRequirements.length > 0 ? 'VALIDATED' : 'CANDIDATE';

        const analysis: RequirementsAnalysis = {
            id: '',
            leadId,
            researchVersionId: researchData?.versionId || '',
            qualificationVersionId:
                researchData?.qualificationVersionId ||
                researchData?.qualification_version_id ||
                '',
            painAnalysisVersionId: painAnalysis?.id || '',
            analysisVersion: 0,
            status: analysisStatus,
            overallCompleteness,
            overallConfidence,
            requirements: validatedRequirements,
            unresolvedQuestions: [],
            createdAt: new Date(),
        };

        // When the originating manual AI task is provided, the persisted Pain
        // identity (manual_ai_tasks.pain_analysis_id) and the stamped Research/
        // Qualification version identity override anything caller-supplied,
        // and the REVIEWED transition runs atomically inside the persistence
        // transaction (RequirementVersionManager.saveVersion).
        const savedAnalysis = await this.versionManager.saveVersion(
            analysis,
            lead.company_id || null,
            taskId ? { taskId } : undefined
        );

        await auditLogger.log({
            action: 'REQUIREMENTS_ANALYSIS_COMPLETED',
            entityType: 'RequirementsAnalysis',
            entityId: leadId,
            details: {
                id: savedAnalysis.id,
                analysisVersion: savedAnalysis.analysisVersion,
                reqCount: savedAnalysis.requirements.length,
                overallCompleteness,
                overallConfidence,
            },
        });

        return savedAnalysis;
    }
}
