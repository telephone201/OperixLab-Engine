/**
 * @file matching-review-controller.ts
 * @description Controller for the human review of persisted matching
 * recommendations: POST /api/matching/review/:sessionId/approve and
 * :sessionId/reject, following the project's review-controller
 * error-envelope conventions.
 */

import { Request, Response } from 'express';
import { matchingReviewService } from '../services/matching/matching-review-service';
import { matchingOrchestrator } from '../services/matching/matching-orchestrator';
import { db } from '../lib/db';

const MATCHING_REVIEW_ERROR_STATUS: Record<string, number> = {
    MATCHING_REVIEW_SESSION_NOT_FOUND: 404,
    MATCHING_REVIEW_ARCHITECTURE_NOT_FOUND: 404,
    MATCHING_REVIEW_ALREADY_DECIDED: 409,
    MATCHING_REVIEW_NOT_READY: 409,
    MATCHING_REVIEW_USER_REQUIRED: 400
};

export class MatchingReviewController {
    /**
     * POST /api/matching/review/:sessionId/approve
     */
    async approveMatch(req: Request, res: Response) {
        try {
            const sessionId = String(req.params.sessionId || '').trim();
            const userId = req.user!.id;
            const reason = req.body?.reason
                ? String(req.body.reason).trim() || undefined
                : undefined;

            if (!sessionId) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'sessionId is required'
                    }
                });
            }

            const result = await matchingReviewService.approveMatch(
                sessionId,
                userId,
                reason
            );

            return res.status(200).json({ data: result });
        } catch (error: any) {
            const status = MATCHING_REVIEW_ERROR_STATUS[error.message] ?? 500;

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }

    /**
     * POST /api/matching/review/:sessionId/reject
     *
     * Option B semantics (approved architectural decision): the matching
     * session transitions to REJECTED while the persisted artifact
     * intentionally remains DRAFT ("not selected / not consumable").
     */
    async rejectMatch(req: Request, res: Response) {
        try {
            const sessionId = String(req.params.sessionId || '').trim();
            const userId = req.user!.id;
            const reason = req.body?.reason
                ? String(req.body.reason).trim() || undefined
                : undefined;

            if (!sessionId) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'sessionId is required'
                    }
                });
            }

            const result = await matchingReviewService.rejectMatch(
                sessionId,
                userId,
                reason
            );

            return res.status(200).json({ data: result });
        } catch (error: any) {
            const status = MATCHING_REVIEW_ERROR_STATUS[error.message] ?? 500;

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }

    /**
     * POST /api/leads/:id/matching/run
     * Executes workflow matching for the lead's latest requirements analysis.
     */
    async runMatching(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id || '').trim();

            if (!leadId) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Lead ID is required'
                    }
                });
            }

            const analysisResult = await db.query(
                `SELECT "id" FROM "requirements_analyses" WHERE "lead_id" = $1 ORDER BY "analysis_version" DESC, "created_at" DESC LIMIT 1`,
                [leadId]
            );

            if (!analysisResult.rows[0]) {
                return res.status(404).json({
                    error: {
                        code: 'REQUIREMENTS_NOT_FOUND',
                        message: 'No requirements analysis found for this lead. Extract requirements first.'
                    }
                });
            }

            const outcome = await matchingOrchestrator.onRequirementsReviewed({
                leadId,
                requirementsAnalysisId: analysisResult.rows[0].id
            });

            if (outcome.status === 'FAILED') {
                return res.status(500).json({
                    error: {
                        code: 'MATCHING_FAILED',
                        message: outcome.error
                    }
                });
            }

            if (outcome.status === 'SKIPPED') {
                return res.status(409).json({
                    error: {
                        code: 'MATCHING_SKIPPED',
                        message: outcome.reason
                    }
                });
            }

            return res.status(200).json({ data: outcome.matching });
        } catch (error: any) {
            return res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error?.message || 'Matching execution failed'
                }
            });
        }
    }
}

export const matchingReviewController = new MatchingReviewController();

