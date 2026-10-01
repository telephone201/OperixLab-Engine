/**
 * @file notification-system.ts
 * @description Deterministic notification system for the Operix engine.
 */

import { db } from "../../lib/db";

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Notification {
    type: string;
    priority: NotificationPriority;
    message: string;
    entityId?: string;
    created_at: Date;
    is_read: boolean;
}

export class NotificationSystem {
    async notify(
        type: string,
        message: string,
        priority: NotificationPriority = 'MEDIUM',
        entityId?: string
    ): Promise<void> {
        await db.notifications.create({
            data: {
                type,
                priority,
                message,
                entity_id: entityId,
                is_read: false
            }
        });
    }
}

export const notifications = new NotificationSystem();
