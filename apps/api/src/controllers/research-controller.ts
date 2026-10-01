/**
 * @file research-controller.ts
 * @description Controller for retrieving lead research data.
 */

import { Request, Response } from 'express';
import { researchManager } from '../services/research/research-manager';
import { manualAIResearchService } from '../services/research/manual-ai-research-tasks';
import { leadLifecycleOrchestrator } from '../services/orchestration/lead-lifecycle-orchestrator';
import { db } from '../lib/db';

export class ResearchController {
    /**
     * POST /api/leads/:id/research
     * Creates a manual AI research task and returns the generated prompt.
     */
    async createResearchTask(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
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
                where: { id }
            });

            if (!lead) {
                return res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Lead not found'
                    }
                });
            }

            const company = lead.company_id
                ? await db.companies.findUnique({
                    where: { id: lead.company_id }
                })
                : null;

            if (!company) {
                return res.status(400).json({
                    error: {
                        code: 'COMPANY_NOT_FOUND',
                        message: 'Lead has no associated company'
                    }
                });
            }

            const task = await manualAIResearchService.createTask(
                id,
                provider
            );

            const prompt = provider === 'PERPLEXITY'
                ? await manualAIResearchService.generatePerplexityPrompt(company)
                : await manualAIResearchService.generatePerplexityPrompt(company);

            await db.manual_ai_tasks.update({
                where: { id: task.id },
                data: {
                    generated_prompt: prompt,
                    updated_at: new Date()
                }
            });

            return res.status(201).json({
                data: {
                    taskId: task.id,
                    researchRequestId: task.researchRequestId,
                    provider,
                    prompt,
                    status: 'READY'
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
     * GET /api/leads/:id/research
     * Returns research summaries and evidence for a lead.
     */
    async submitResearchResult(req: Request, res: Response) {
        try {
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

            try {
                await manualAIResearchService.submitResult(taskId, result);

                const persisted = await manualAIResearchService.persistResearchResult(
                    taskId,
                    evidence
                );

                // Downstream lifecycle steps run only after Research has fully
                // persisted. A Qualification failure must never fail the Research
                // response or roll back persisted Research data.
                const lifecycle = await leadLifecycleOrchestrator.onResearchPersisted(
                    persisted.leadId
                );

                return res.status(201).json({
                    data: {
                        taskId,
                        status: 'REVIEWED',
                        persisted,
                        lifecycle: {
                            qualification: lifecycle.status
                        }
                    }
                });
            } catch (error: any) {
                if (
                    error.message === 'RESEARCH_TASK_ALREADY_REVIEWED' ||
                    error.message === 'RESEARCH_REQUEST_ALREADY_COMPLETED'
                ) {
                    return res.status(409).json({
                        error: {
                            code: error.message,
                            message: 'Research result has already been submitted for this task'
                        }
                    });
                }

                throw error;
            }
        } catch (error: any) {
            return res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error.message
                }
            });
        }
    }
    async getResearch(req: Request, res: Response) {
        try {
            const id = String(req.params.id);

            // We fetch the research request associated with the lead
            const researchRequest = await db.research_requests.findFirst({
                where: { lead_id: id },
                orderBy: { created_at: 'desc' }
            });

            if (!researchRequest) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'No research found for this lead' }
                });
            }

            // In a real implementation, we'd use the ResearchManager to aggregate
            // evidence and summaries from the research data tables.
            const researchData = await db.research_data.findMany({
                where: { request_id: researchRequest.id }
            });

            return res.json({
                data: {
                    requestId: researchRequest.id,
                    status: researchRequest.status,
                    evidence: researchData,
                    summary: "Aggregated research summary based on evidence."
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }
}
