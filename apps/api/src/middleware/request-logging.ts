import { Request, Response, NextFunction } from 'express';
import { getCorrelationId, getClientIpHash } from '../core/logging/audit-context';

export function requestLoggingMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
        try {
            const durationMs =
                Number(process.hrtime.bigint() - startedAt) / 1_000_000;

            const correlationId = getCorrelationId() ?? 'unknown';
            const clientIpHash = getClientIpHash();

            console.log(
                `[REQUEST] ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms correlationId=${correlationId}` +
                (clientIpHash ? ` ipHash=${clientIpHash}` : '')
            );
        } catch (error) {
            console.error('[REQUEST_LOGGING] Failed to log request:', error);
        }
    });

    next();
}
