/**
 * @file audit-logger.ts
 * @description Foundation for system-wide audit logging.
 * Persists to audit_logs table with failure isolation and sensitive data filtering.
 */

import { db } from '../../lib/db';
import { getCorrelationId, getClientIpHash } from './audit-context';
import { serializeAuditDetails } from './sensitive-filter';

export interface AuditEntry {
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    timestamp: Date;
    details: any;
}

export class AuditLogger {
    async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
        const fullEntry: AuditEntry = {
            ...entry,
            timestamp: new Date()
        };

        // Serialize details with sensitive data filtering and size protection
        const serializedDetails = serializeAuditDetails(entry.details);

        // Get correlation context (may be undefined/null in background jobs)
        const correlationId = getCorrelationId();
        const clientIpHash = getClientIpHash();

        // Persist to database with failure isolation
        // Audit failure must NEVER break the business operation
        try {
            await db.query(
                `INSERT INTO "audit_logs"
                 ("user_id", "action", "entity_type", "entity_id", "timestamp", "details", "correlation_id", "ip_hash")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    fullEntry.userId ?? null,
                    fullEntry.action,
                    fullEntry.entityType ?? null,
                    fullEntry.entityId ?? null,
                    fullEntry.timestamp,
                    serializedDetails,
                    correlationId ?? null,
                    clientIpHash ?? null
                ]
            );
        } catch (error) {
            // Log the failure but never throw into business flow
            console.error('[AUDIT] Persistence failed:', error);
        }

        // Keep console output for development visibility
        console.log(
            `[AUDIT] ${fullEntry.timestamp.toISOString()} | ${fullEntry.action} | ${fullEntry.entityType}:${fullEntry.entityId}`,
            serializedDetails
        );
    }
}

export const auditLogger = new AuditLogger();
