/**
 * @file audit-logger.ts
 * @description Foundation for system-wide audit logging.
 */

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

        // In a real implementation, this would write to the audit_logs table via the DB provider.
        console.log(`[AUDIT] ${fullEntry.timestamp.toISOString()} | ${fullEntry.action} | ${fullEntry.entityType}:${fullEntry.entityId}`, fullEntry.details);
    }
}

export const auditLogger = new AuditLogger();
