/**
 * @file approvals-controller.ts
 * @description Controller for dashboard approval queue.
 */

import { Request, Response } from 'express';
import { humanApprovalService } from '../services/governance/approval-service';

export class ApprovalsController {
    /**
     * GET /api/governance/approvals
     * Returns actionable, non-expired pending approvals.
     */
    async getPendingApprovals(req: Request, res: Response) {
        try {
            const approvals = await humanApprovalService.getPendingApprovals();

            return res.json({
                data: approvals
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
}
