/**
 * @file human-override-service.ts
 * @description Service for manual adjustments to qualification scores and intent states with audit trail.
 */

import { auditLogger } from '../core/logging/audit-logger';

export interface OverrideRequest {
    leadId: string;
    entityType: 'SCORE' | 'INTENT';
    originalValue: any;
    newValue: any;
    userId: string;
    reason: string;
}

export class HumanOverrideService {
    /**
     * Applies a manual override to a lead's qualification or intent state.
     */
    async applyOverride(request: OverrideRequest): Promise<void> {
        // 1. Validation: Ensure reason is provided
        if (!request.reason || request.reason.length < 10) {
            throw new Error('A detailed reason is required for human overrides.');
        }

        // 2. Log to Audit Trail (Crucial for evidence-based system)
        await auditLogger.log({
            action: 'HUMAN_OVERRIDE_APPLIED',
            entityType: request.entityType,
            entityId: request.leadId,
            details: {
                originalValue: request.originalValue,
                newValue: request.newValue,
                userId: request.userId,
                reason: request.reason,
            },
        });

        // 3. Update database (Mock)
        console.log(`[OVERRIDE] Lead ${request.leadId} ${request.entityType} changed to ${request.newValue} by ${request.userId}`);
        // await db.human_overrides.create(request);
    }
}
