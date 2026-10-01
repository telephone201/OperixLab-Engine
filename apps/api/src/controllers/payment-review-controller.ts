/**
 * @file payment-review-controller.ts
 * @description Controller for dashboard payment review queue.
 */

import { Request, Response } from 'express';
import { paymentService } from '../services/projects/payment-service';

export class PaymentReviewController {
    /**
     * GET /api/dashboard/payments/review
     * Returns submitted payments that require human verification.
     */
    async getPendingReviews(req: Request, res: Response) {
        try {
            const payments = await paymentService.getPendingReviews();

            return res.json({
                data: payments
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
