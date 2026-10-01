import { Request, Response } from 'express';
import { pricingReviewService } from '../services/dashboard/pricing-review-service';

export class PricingReviewController {
    async getPendingReviews(req: Request, res: Response) {
        try {
            const reviews = await pricingReviewService.getPendingReviews();

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

export const pricingReviewController = new PricingReviewController();
