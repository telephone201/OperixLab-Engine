import { Request, Response } from 'express';
import { dashboardSummaryService } from '../services/dashboard/dashboard-summary-service';

export class DashboardSummaryController {
    async getSummary(req: Request, res: Response) {
        try {
            const summary = await dashboardSummaryService.getSummary();

            return res.json({
                data: summary
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

export const dashboardSummaryController = new DashboardSummaryController();
