/**
 * @file qualification-controller.ts
 * @description Controller for retrieving qualification scores and intent.
 */

import { Request, Response } from 'express';
import { QualificationClassifier } from '../services/qualification/qualification-classifier';
import { IntentManager } from '../services/qualification/intent-manager';
import { db } from '../lib/db';

export class QualificationController {
    private classifier = new QualificationClassifier();
    private intentManager = new IntentManager();

    /**
     * GET /api/leads/:id/qualification
     * Returns qualification scores, labels, and intent state.
     */
    async getQualification(req: Request, res: Response) {
        try {
            const { id } = req.params;

            // Fetch the qualification record for the lead
            const qual = await db.qualification_results.findFirst({
                where: { lead_id: id },
                orderBy: { created_at: 'desc' }
            });

            if (!qual) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Qualification not found' }
                });
            }

            // Fetch intent state
            const intentState = await db.intent_states.findFirst({
                where: { lead_id: id },
                orderBy: { updated_at: 'desc' }
            });

            return res.json({
                data: {
                    score: qual.total_score,
                    maxScore: qual.max_score,
                    label: qual.label,
                    components: JSON.parse(qual.components || '[]'),
                    intent: intentState ? {
                        state: intentState.state,
                        score: intentState.score,
                        confidence: intentState.confidence
                    } : null
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }
}
