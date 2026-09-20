/**
 * @file research-controller.ts
 * @description Controller for retrieving lead research data.
 */

import { Request, Response } from 'express';
import { researchManager } from '../services/research/research-manager';
import { db } from '../lib/db';

export class ResearchController {
    /**
     * GET /api/leads/:id/research
     * Returns research summaries and evidence for a lead.
     */
    async getResearch(req: Request, res: Response) {
        try {
            const { id } = req.params;

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
