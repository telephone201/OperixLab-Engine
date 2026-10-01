import { Request, Response } from 'express';
import { proposalReviewService } from '../services/dashboard/proposal-review-service';

export class ProposalReviewController {
    async getPendingReviews(req: Request, res: Response) {
        try {
            const reviews = await proposalReviewService.getPendingReviews();

            return res.json({
                data: reviews
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

export const proposalReviewController = new ProposalReviewController();
