/**
 * @file requirements-controller.ts
 * @description Controller for retrieving requirements analysis data.
 */

import { Request, Response } from 'express';
import { RequirementsAnalysisService } from '../services/requirements/requirements-analysis-service';
import { db } from '../lib/db';

export class RequirementsController {
    private reqService = new RequirementsAnalysisService();

    /**
     * GET /api/leads/:id/requirements
     * Returns the prioritized requirements list for a lead.
     */
    async getRequirements(req: Request, res: Response) {
        try {
            const { id } = req.params;

            // Retrieve the requirements analysis record from the DB
            const analysis = await db.requirements_analyses.findFirst({
                where: { lead_id: id },
                orderBy: { created_at: 'desc' }
            });

            if (!analysis) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Requirements analysis not found for this lead' }
                });
            }

            return res.json({
                data: {
                    overallCompleteness: analysis.overall_completeness,
                    overallConfidence: analysis.overall_confidence,
                    requirements: JSON.parse(analysis.requirements || '[]'),
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
