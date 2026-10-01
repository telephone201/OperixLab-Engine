/**
 * @file matching-read-controller.ts
 * @description Controller for the READ-ONLY matching surface (STEP 6):
 * GET /api/leads/:id/matching and
 * GET /api/leads/:id/matching/sessions/:sessionId.
 * Error-envelope mapping follows the project's existing controller
 * conventions. Strictly read-only: no writes, no audit records.
 */

import { Request, Response } from 'express';
import { matchingReadService } from '../services/matching/matching-read-service';
import { MATCHING_ARCHITECTURE_INVARIANT_VIOLATED } from '../services/matching/matching-read-service';

const MATCHING_READ_ERROR_STATUS: Record<string, number> = {
    MATCHING_SESSIONS_NOT_FOUND: 404,
    MATCHING_SESSION_NOT_FOUND: 404,
    MATCHING_ARCHITECTURE_INVARIANT_VIOLATED: 409
};

export class MatchingReadController {
    /**
     * GET /api/leads/:id/matching
     */
    async getLeadMatchingSessions(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id || '').trim();

            const sessions = await matchingReadService.getLeadMatchingSessions(
                leadId
            );

            return res.status(200).json({ data: sessions });
        } catch (error: any) {
            return this.sendError(res, error);
        }
    }

    /**
     * GET /api/leads/:id/matching/sessions/:sessionId
     */
    async getMatchingSessionDetail(req: Request, res: Response) {
        try {
            const leadId = String(req.params.id || '').trim();
            const sessionId = String(req.params.sessionId || '').trim();

            const session = await matchingReadService.getMatchingSessionDetail(
                leadId,
                sessionId
            );

            return res.status(200).json({ data: session });
        } catch (error: any) {
            return this.sendError(res, error);
        }
    }

    private sendError(res: Response, error: any) {
        const status = MATCHING_READ_ERROR_STATUS[error?.message] ?? 500;

        return res.status(status).json({
            error: {
                code: status === 500 ? 'INTERNAL_ERROR' : error.message,
                message: error.message
            }
        });
    }
}

export const matchingReadController = new MatchingReadController();
