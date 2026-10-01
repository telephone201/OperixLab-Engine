/**
 * @file notifications-controller.ts
 * @description Controller for dashboard notification retrieval.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';

export class NotificationsController {
    /**
     * GET /api/notifications
     * Returns the latest notifications for the owner dashboard.
     */
    async getNotifications(req: Request, res: Response) {
        try {
            const notifications = await db.notifications.findMany({
                take: 100,
                orderBy: { created_at: 'desc' }
            });

            return res.json({ data: notifications });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }
}
