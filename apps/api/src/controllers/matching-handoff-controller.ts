/**
 * @file matching-handoff-controller.ts
 * @description Controller for the STEP 7 production handoff:
 * POST /api/leads/:id/matching/sessions/:sessionId/handoff.
 * Error-envelope mapping follows the project's existing controller
 * conventions.
 */

import { Request, Response } from 'express';
import { matchingCommercialHandoffService } from '../services/projects/matching-commercial-handoff-service';

const MATCHING_HANDOFF_ERROR_STATUS: Record<string, number> = {
    MATCHING_HANDOFF_SESSION_NOT_FOUND: 404,
    MATCHING_HANDOFF_NOT_APPROVED: 409,
    MATCHING_HANDOFF_NOT_READY: 409,
    MATCHING_HANDOFF_REJECTED_SESSION: 409,
    MATCHING_HANDOFF_ARCHITECTURE_NOT_FOUND: 404,
    MATCHING_HANDOFF_ARCHITECTURE_NOT_APPROVED: 409,
    MATCHING_HANDOFF_STRATEGY_NOT_HANDOFFABLE: 409,
    MATCHING_ARCHITECTURE_INVARIANT_VIOLATED: 409,
    MATCHING_HANDOFF_LEAD_CONTEXT_MISSING: 409,
    USER_REQUIRED: 400
};

export class MatchingHandoffController {
    /**
     * POST /api/leads/:id/matching/sessions/:sessionId/handoff
     */
    async handoff(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id || '').trim();
            const sessionId = String(req.params.sessionId || '').trim();
            const userId = req.user!.id;
            const currency = req.body?.currency
                ? String(req.body.currency).trim() || 'EGP'
                : 'EGP';

            if (!sessionId) {
                return res.status(400).json({
                    error: {
                        code: 'USER_REQUIRED',
                        message: 'sessionId is required'
                    }
                });
            }

            const result = await matchingCommercialHandoffService.handoffApprovedSession(
                {
                    leadId,
                    sessionId,
                    userId,
                    currency
                }
            );

            return res.status(201).json({ data: result });
        } catch (error: any) {
            const status = MATCHING_HANDOFF_ERROR_STATUS[error?.message] ?? 500;

            return res.status(status).json({
                error: {
                    code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                    message: error.message
                }
            });
        }
    }
}

export const matchingHandoffController = new MatchingHandoffController();

