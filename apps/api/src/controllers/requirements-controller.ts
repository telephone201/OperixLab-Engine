/**
 * @file requirements-controller.ts
 * @description Controller for retrieving requirements analysis data.
 */

import { Request, Response } from 'express';
import { RequirementsAnalysisService } from '../services/requirements/requirements-analysis-service';
import { requirementVersionManager } from '../services/requirements/requirement-version-manager';
import { manualAITaskService } from '../services/manual-ai/manual-ai-task-service';
import { leadPainContextAssembler } from '../services/orchestration/lead-pain-context-assembler';
import { painVersionManager } from '../services/pain/pain-version-manager';
import { db } from '../lib/db';
import { matchingOrchestrator } from '../services/matching/matching-orchestrator';

const REQUIREMENTS_ERROR_STATUS: Record<string, number> = {
    REQUIREMENTS_TASK_ALREADY_REVIEWED: 409,
    REQUIREMENTS_TASK_NOT_FOUND: 404,
    REQUIREMENTS_TASK_TYPE_MISMATCH: 409,
    REQUIREMENTS_TASK_LEAD_MISMATCH: 409,
    REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND: 404,
    REQUIREMENTS_NO_SUPPORTED_PAINS: 409,
    REQUIREMENTS_TASK_VERSION_IDENTITY_MISSING: 409,
    REQUIREMENTS_RESEARCH_VERSION_NOT_FOUND: 404,
    REQUIREMENTS_QUALIFICATION_VERSION_NOT_FOUND: 404,
    RESEARCH_CONTEXT_NOT_FOUND: 404,
    QUALIFICATION_CONTEXT_NOT_FOUND: 404,
    LEAD_NOT_FOUND: 404,
    INVALID_PROVIDER: 400,
    INVALID_REQUEST: 400
};

function requirementsErrorStatus(error: Error): number {
    return REQUIREMENTS_ERROR_STATUS[error.message] ?? 500;
}

export class RequirementsController {
    private reqService = new RequirementsAnalysisService();

    /**
     * GET /api/leads/:id/requirements
     * Returns the prioritized requirements list for a lead.
     */
    async getRequirements(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const analysis = await db.requirements_analyses.findFirst({
                where: { lead_id: id },
                orderBy: { created_at: 'desc' }
            });

            if (!analysis) {
                return res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Requirements analysis not found for this lead'
                    }
                });
            }

            const requirements = await db.requirements.findMany({
                where: { analysis_id: analysis.id },
                orderBy: { created_at: 'asc' }
            });

            return res.json({
                data: {
                    overallCompleteness: analysis.overall_completeness,
                    overallConfidence: analysis.overall_confidence,
                    requirements,
                    unresolvedQuestions: []
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error.message
                }
            });
        }
    }

    /**
     * POST /api/leads/:id/requirements
     * Creates a REQUIREMENTS_EXTRACTION manual AI task for the lead, stamped
     * with the exact Research/Qualification version identity and the
     * persisted Pain analysis identity, and returns the generated prompt.
     */
    async initiateRequirementsAnalysis(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id);
            const provider = req.body?.provider;

            if (provider !== 'PERPLEXITY' && provider !== 'GEMINI') {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_PROVIDER',
                        message: 'Provider must be PERPLEXITY or GEMINI'
                    }
                });
            }

            const lead = await db.leads.findUnique({
                where: { id: leadId }
            });

            if (!lead) {
                return res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Lead not found'
                    }
                });
            }

            // Resolves the exact Research and Qualification identity from
            // canonical persisted state (throws RESEARCH/QUALIFICATION_CONTEXT_NOT_FOUND).
            const context = await leadPainContextAssembler.assemble(leadId);

            // Pain identity must come from persisted state: the canonical
            // completed Pain analysis for this lead (pain_analyses.id), loaded
            // with its persisted pains. No caller-supplied or pre-persistence
            // Pain objects are accepted.
            const painAnalysis = await painVersionManager.getVersion(
                leadId,
                await this.latestPainAnalysisVersion(leadId)
            );

            if (!painAnalysis) {
                return res.status(404).json({
                    error: {
                        code: 'REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND',
                        message: 'No persisted Pain analysis found for this lead'
                    }
                });
            }

            if (!Array.isArray(painAnalysis.pains) || painAnalysis.pains.length === 0) {
                return res.status(409).json({
                    error: {
                        code: 'REQUIREMENTS_NO_SUPPORTED_PAINS',
                        message: 'Requirements extraction cannot start because the persisted Pain analysis contains no supported pains'
                    }
                });
            }
            const task = await this.reqService.extractRequirements(
                leadId,
                {
                    companyName: context.company.name,
                    industry: context.company.industry,
                    website: context.company.website,
                    summary: context.research.summary,
                    evidence: context.research.evidence,
                    // Requirements service reads researchData.versionId
                    versionId: context.research.researchVersionId,
                    qualificationSummary: context.qualification.summary,
                    qualificationVersionId: context.qualification.qualificationVersionId
                },
                {
                    id: painAnalysis.id,
                    pains: painAnalysis.pains
                },
                provider,
                {
                    researchVersionId: context.research.researchVersionId,
                    qualificationVersionId: context.qualification.qualificationVersionId,
                    painAnalysisId: painAnalysis.id
                },
                undefined
            );

            return res.status(201).json({
                data: {
                    taskId: task.taskId,
                    prompt: task.prompt,
                    researchVersionId: context.research.researchVersionId,
                    qualificationVersionId: context.qualification.qualificationVersionId,
                    painAnalysisId: painAnalysis.id,
                    status: 'READY'
                }
            });
        } catch (error: any) {
            const status = requirementsErrorStatus(error);

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }

    /**
     * POST /api/leads/:id/requirements/result
     * Processes the submitted AI result for a REQUIREMENTS_EXTRACTION task.
     * The task is the source of identity: lead, Research/Qualification
     * versions and the persisted Pain analysis are read from the task row
     * (stamped at initiation), never from the request body. Replay/reviewed
     * protection lives inside the persistence transaction
     * (RequirementVersionManager.saveVersion).
     */
    async submitRequirementsResult(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id);
            const taskId = String(req.body?.taskId || '');
            const result = String(req.body?.result || '');

            if (!taskId || !result) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'taskId and result are required'
                    }
                });
            }

            const task = await manualAITaskService.getTask(taskId);

            if (!task || task.leadId !== leadId) {
                return res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Requirements task not found for this lead'
                    }
                });
            }

            if (task.taskType !== 'REQUIREMENTS_EXTRACTION') {
                return res.status(409).json({
                    error: {
                        code: 'REQUIREMENTS_TASK_TYPE_MISMATCH',
                        message: 'Task is not a REQUIREMENTS_EXTRACTION task'
                    }
                });
            }

            // Exact identity stamped at initiation â€” never from the request body.
            const researchVersionId = task.researchVersionId;
            const qualificationVersionId = task.qualificationVersionId;
            const painAnalysisId = task.painAnalysisId;

            if (!researchVersionId || !qualificationVersionId || !painAnalysisId) {
                return res.status(409).json({
                    error: {
                        code: 'REQUIREMENTS_TASK_VERSION_IDENTITY_MISSING',
                        message: 'Requirements task has no stamped identity'
                    }
                });
            }

            // Load the persisted Pain analysis (real UUID + persisted pains with
            // real source_pain_id UUIDs) â€” never a pre-persistence Pain object.
            const painRow = await db.pain_analyses.findUnique({
                where: { id: painAnalysisId }
            });

            if (!painRow || painRow.lead_id !== leadId) {
                return res.status(404).json({
                    error: {
                        code: 'REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND',
                        message: 'Persisted Pain analysis not found for this lead'
                    }
                });
            }

            const painAnalysis = await painVersionManager.getVersion(
                leadId,
                painRow.analysis_version
            );

            if (!painAnalysis) {
                return res.status(404).json({
                    error: {
                        code: 'REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND',
                        message: 'Persisted Pain analysis not found for this lead'
                    }
                });
            }

            if (!Array.isArray(painAnalysis.pains) || painAnalysis.pains.length === 0) {
                return res.status(409).json({
                    error: {
                        code: 'REQUIREMENTS_NO_SUPPORTED_PAINS',
                        message: 'Requirements result cannot be processed because the persisted Pain analysis contains no supported pains'
                    }
                });
            }
            const savedAnalysis = await this.reqService.processAnalysisResult(
                leadId,
                result,
                {
                    // Requirements service reads researchData.versionId
                    versionId: researchVersionId,
                    qualificationVersionId,
                    // Research evidence for validator membership checks
                    evidence: []
                },
                {
                    id: painAnalysis.id,
                    pains: painAnalysis.pains
                },
                taskId
            );

            // Downstream lifecycle step: Workflow Matching runs only after the
            // Requirements REVIEWED result has fully persisted. The orchestrator
            // is intentionally never-throw â€” a matching failure must never fail
            // the Requirements submission (same pattern as
            // leadLifecycleOrchestrator.onResearchPersisted in research-controller).
            const matching = await matchingOrchestrator.onRequirementsReviewed({
                leadId,
                requirementsAnalysisId: savedAnalysis.id
            });

            return res.status(201).json({
                data: {
                    taskId,
                    requirementsAnalysisId: savedAnalysis.id,
                    analysisVersion: savedAnalysis.analysisVersion,
                    status: savedAnalysis.status,
                    overallCompleteness: savedAnalysis.overallCompleteness,
                    overallConfidence: savedAnalysis.overallConfidence,
                    requirementCount: savedAnalysis.requirements.length,
                    painAnalysisId: painAnalysis.id,
                    matching: {
                        status: matching.status
                    }
                }
            });
        } catch (error: any) {
            const status = requirementsErrorStatus(error);

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }

    /**
     * Resolves the latest persisted Pain analysis version number for a lead.
     */
    private async latestPainAnalysisVersion(leadId: string): Promise<number> {
        const result = await db.query(
            `
            SELECT "analysis_version"
            FROM "pain_analyses"
            WHERE "lead_id" = $1
            ORDER BY "analysis_version" DESC
            LIMIT 1
            `,
            [leadId]
        );

        if (!result.rows[0]) {
            throw new Error('REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND');
        }

        return Number(result.rows[0].analysis_version);
    }
}



