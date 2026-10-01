/**
 * @file request-context.ts
 * @description Express middleware for audit correlation context.
 * Extracts/inherits correlation ID, hashes client IP, stores in AsyncLocalStorage.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { runWithContext } from '../core/logging/audit-context';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a string as UUID v4.
 */
function isValidUuidV4(value: string): boolean {
    return UUID_V4_REGEX.test(value);
}

/**
 * Extracts client IP from Express request.
 * Assumes 'trust proxy' is configured upstream.
 */
function getClientIp(req: Request): string | undefined {
    // Express with trust proxy: req.ip gives the client IP
    if (req.ip) {
        return req.ip;
    }
    // Fallback to socket remote address
    return req.socket?.remoteAddress;
}

/**
 * Hashes an IP address using SHA-256.
 * Returns hex string (64 chars) or null if input is undefined.
 */
function hashIp(ip: string | undefined): string | null {
    if (!ip) {
        return null;
    }
    // Normalize IPv6 mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Express middleware that establishes audit request context.
 * - Inherits x-request-id header if valid UUID v4
 * - Generates new UUID v4 if missing or invalid
 * - Hashes client IP (never stores raw IP)
 * - Stores in AsyncLocalStorage for the request lifecycle
 */
export function requestContextMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    // Extract and validate correlation ID from header
    const headerId = req.headers['x-request-id'];
    let correlationId: string;
    
    if (typeof headerId === 'string' && isValidUuidV4(headerId)) {
        correlationId = headerId;
    } else {
        correlationId = crypto.randomUUID();
    }
    
    // Extract and hash client IP
    const clientIp = getClientIp(req);
    const clientIpHash = hashIp(clientIp);
    
    // Run the rest of the request with context
    runWithContext(
        { correlationId, clientIpHash },
        () => next()
    );
}