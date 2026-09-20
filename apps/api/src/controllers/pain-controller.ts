/**
 * @file pain-controller.ts
 * @description Controller for retrieving pain analysis data.
 */

import { Request, Response } from 'express';
import { PainAnalysisService } from '../services/pain/pain-analysis-service';
import { db } from '../lib/db';

export class PainController {
    private painService = new PainAnalysisService();

    /**
     * GET /api/leads/:id/pain
     * Returns the pain analysis and unresolved questions for a lead.
     */
    async getPainAnalysis(req: Request, res: Response) {
        try {
            const { id } = req.params;

            // Retrieve the pain analysis record from the DB
            const analysis = await db.pain_analyses.findFirst({
                where: { lead_id: id },
                orderBy: { created_at: 'desc' }
            });

            if (!analysis) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Pain analysis not found for this lead' }
                });
            }

            return res.json({
                data: {
                    overallConfidence: analysis.overall_confidence,
                    primaryPainId: analysis.primary_pain_id,
                    pains: JSON.parse(analysis.pains || '[]'),
                    unresolvedQuestions: JSON.parse(analysis.unresolved_questions || '[]')
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }
}
