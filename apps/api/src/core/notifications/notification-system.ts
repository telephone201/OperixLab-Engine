/**
 * @file notification-system.ts
 * @description Deterministic notification system for the Operix engine.
 */

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
    async notify(type: string, message: string, priority: NotificationPriority = 'MEDIUM', entityId?: string): Promise<void> {
        const notification: Notification = {
            type,
            priority,
            message,
            entityId,
            created_at: new Date(),
            is_read: false
        };

        // In a real implementation, this would save to the notifications table.
        console.log(`[NOTIFICATION][${priority}] ${type}: ${message} (Entity: ${entityId})`);
    }
}

export const notifications = new NotificationSystem();
