/**
 * @file qualification-controller.ts
 * @description Controller for retrieving qualification scores and intent.
 */

import { Request, Response } from 'express';
import { QualificationClassifier } from '../services/qualification/qualification-classifier';
import { IntentManager } from '../services/qualification/intent-manager';
import { qualificationService } from '../services/qualification/qualification-service';
import { QualificationVersionManager } from '../services/qualification/qualification-version-manager';
import { QualificationResult } from '../services/qualification/qualification-types';
import { db } from '../lib/db';

export class QualificationController {
    private classifier = new QualificationClassifier();
    private intentManager = new IntentManager();
    private versionManager = new QualificationVersionManager();

    /**
     * GET /api/leads/:id/qualification
     * Returns qualification scores, labels, and intent state.
     */
    async getQualification(req: Request, res: Response) {
        try {
            const id = String(req.params.id);

            // Read from the canonical versioned qualification tables
            const result = await this.versionManager.getLatestResult(id);

            if (!result) {
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
                data: this.toWireShape(result, intentState)
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * POST /api/leads/:id/qualification
     * Calculates and persists a new qualification version for the lead.
     */
    async calculateQualification(req: Request, res: Response) {
        try {
            const id = String(req.params.id);

            const lead = await db.leads.findUnique({
                where: { id }
            });

            if (!lead) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Lead not found' }
                });
            }

            const result = await qualificationService.calculateAndSave(id);

            // Fetch intent state
            const intentState = await db.intent_states.findFirst({
                where: { lead_id: id },
                orderBy: { updated_at: 'desc' }
            });

            return res.status(201).json({
                data: this.toWireShape(result, intentState)
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * Maps the canonical QualificationResult to the frontend wire shape.
     */
    private toWireShape(result: QualificationResult, intentState: any) {
        return {
            score: result.totalScore,
            maxScore: result.maxScore,
            label: result.label,
            components: result.components.map(component => ({
                name: component.componentName,
                score: component.score,
                weight: component.max_score
            })),
            intent: intentState ? {
                state: intentState.state,
                score: intentState.score,
                confidence: intentState.confidence
            } : null
        };
    }
}
