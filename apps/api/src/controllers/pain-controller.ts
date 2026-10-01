/**
 * @file pain-controller.ts
 * @description Controller for retrieving pain analysis data.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';
import { leadPainContextAssembler } from '../services/orchestration/lead-pain-context-assembler';
import { painAnalysisService } from '../services/pain/pain-analysis-service';
import { manualAITaskService } from '../services/manual-ai/manual-ai-task-service';

const PAIN_ERROR_STATUS: Record<string, number> = {
    PAIN_TASK_ALREADY_REVIEWED: 409,
    PAIN_TASK_NOT_FOUND: 404,
    PAIN_TASK_TYPE_MISMATCH: 409,
    PAIN_TASK_LEAD_MISMATCH: 409,
    PAIN_RESEARCH_VERSION_NOT_FOUND: 404,
    PAIN_QUALIFICATION_VERSION_NOT_FOUND: 404,
    RESEARCH_CONTEXT_NOT_FOUND: 404,
    QUALIFICATION_CONTEXT_NOT_FOUND: 404,
    LEAD_NOT_FOUND: 404,
    INVALID_PROVIDER: 400,
    INVALID_REQUEST: 400
};

function painErrorStatus(error: Error): number {
    return PAIN_ERROR_STATUS[error.message] ?? 500;
}

export class PainController {

    /**
     * GET /api/leads/:id/pain
     * Returns the latest pain analysis, pains, and unresolved questions for a lead.
     */
    async getPainAnalysis(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const analysisResult = await db.query(
                `
                SELECT
                    pa.id,
                    pa.lead_id,
                    pa.research_version_id,
                    pa.qualification_version_id,
                    pa.analysis_version,
                    pa.status,
                    pa.overall_confidence,
                    pa.primary_pain_id,
                    pa.created_at,
                    pa.updated_at
                FROM "pain_analyses" pa
                WHERE pa.lead_id = $1
                ORDER BY pa.analysis_version DESC, pa.created_at DESC
                LIMIT 1
                `,
                [id]
            );

            const analysis = analysisResult.rows[0];

            if (!analysis) {
                return res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Pain analysis not found for this lead'
                    }
                });
            }

            const painsResult = await db.query(
                `
                SELECT
                    p.id,
                    p.analysis_id,
                    p.pain_type,
                    p.title,
                    p.description,
                    p.evidence_type,
                    p.severity,
                    p.frequency,
                    p.automation_relevance,
                    p.confidence,
                    p.status,
                    p.priority,
                    p.reasoning,
                    p.source,
                    p.version,
                    p.created_at,
                    p.updated_at
                FROM "pains" p
                WHERE p.analysis_id = $1
                ORDER BY p.priority DESC, p.created_at ASC
                `,
                [analysis.id]
            );

            const questionsResult = await db.query(
                `
                SELECT
                    pq.id,
                    pq.question_text,
                    pq.target_pain_id,
                    pq.category,
                    pq.status,
                    pq.created_at
                FROM "pain_questions" pq
                WHERE pq.analysis_id = $1
                ORDER BY pq.created_at ASC
                `,
                [analysis.id]
            );

            return res.json({
                data: {
                    id: analysis.id,
                    leadId: analysis.lead_id,
                    researchVersionId: analysis.research_version_id,
                    qualificationVersionId: analysis.qualification_version_id,
                    analysisVersion: analysis.analysis_version,
                    status: analysis.status,
                    overallConfidence: analysis.overall_confidence,
                    primaryPainId: analysis.primary_pain_id,
                    pains: painsResult.rows,
                    unresolvedQuestions: questionsResult.rows,
                    createdAt: analysis.created_at,
                    updatedAt: analysis.updated_at
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
     * POST /api/leads/:id/pain
     * Creates a PAIN_ANALYSIS manual AI task for the lead, stamped with the
     * exact Research and Qualification version identity resolved from the
     * canonical context, and returns the generated prompt.
     */
    async initiatePainAnalysis(req: Request, res: Response) {
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

            // Resolves the exact Research version (via the persisted FK on
            // research_data) and the canonical Qualification result. Throws
            // RESEARCH_CONTEXT_NOT_FOUND / QUALIFICATION_CONTEXT_NOT_FOUND.
            const context = await leadPainContextAssembler.assemble(leadId);

            const task = await painAnalysisService.initiateAnalysis(
                leadId,
                {
                    companyName: context.company.name,
                    industry: context.company.industry,
                    website: context.company.website,
                    summary: context.research.summary,
                    evidence: context.research.evidence,
                    gaps: []
                },
                {
                    summary: context.qualification.summary,
                    // Pain prompt reads qualificationData.signals
                    signals: context.qualification.commercialSignals
                },
                provider,
                {
                    researchVersionId: context.research.researchVersionId,
                    qualificationVersionId: context.qualification.qualificationVersionId
                }
            );

            return res.status(201).json({
                data: {
                    taskId: task.taskId,
                    prompt: task.prompt,
                    researchVersionId: context.research.researchVersionId,
                    qualificationVersionId: context.qualification.qualificationVersionId,
                    status: 'READY'
                }
            });
        } catch (error: any) {
            const status = painErrorStatus(error);

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }

    /**
     * POST /api/leads/:id/pain/result
     * Processes the submitted AI result for a PAIN_ANALYSIS task. The task is
     * the source of identity: lead, Research version and Qualification version
     * are resolved from the task row (stamped at initiation), never from the
     * request body. Replay/reviewed protection lives inside the Pain
     * persistence transaction (PainVersionManager.saveVersion).
     */
    async submitPainResult(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id);
            const taskId = String(req.body?.taskId || '');
            const result = String(req.body?.result || '');
            const evidence = Array.isArray(req.body?.evidence)
                ? req.body.evidence
                : [];

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
                        message: 'Pain task not found for this lead'
                    }
                });
            }

            if (task.taskType !== 'PAIN_ANALYSIS') {
                return res.status(409).json({
                    error: {
                        code: 'PAIN_TASK_TYPE_MISMATCH',
                        message: 'Task is not a PAIN_ANALYSIS task'
                    }
                });
            }

            // Exact versions stamped at initiation — never re-resolved at
            // result time, never taken from the request body.
            const researchVersionId = task.researchVersionId;
            const qualificationVersionId = task.qualificationVersionId;

            if (!researchVersionId || !qualificationVersionId) {
                return res.status(409).json({
                    error: {
                        code: 'PAIN_TASK_VERSION_IDENTITY_MISSING',
                        message: 'Pain task has no stamped Research/Qualification version identity'
                    }
                });
            }

            // Evidence ids must reference the Research evidence supplied with
            // the original research context (validator matches evidence.id).
            const savedAnalysis = await painAnalysisService.processAnalysisResult(
                leadId,
                result,
                researchVersionId,
                qualificationVersionId,
                evidence,
                taskId
            );

            return res.status(201).json({
                data: {
                    taskId,
                    painAnalysisId: savedAnalysis.id,
                    analysisVersion: savedAnalysis.analysisVersion,
                    status: savedAnalysis.status,
                    overallConfidence: savedAnalysis.overallConfidence,
                    primaryPainId: savedAnalysis.primaryPainId ?? null,
                    painCount: savedAnalysis.pains.length,
                    unresolvedQuestions: savedAnalysis.unresolvedQuestions
                }
            });
        } catch (error: any) {
            const status = painErrorStatus(error);

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }
}
