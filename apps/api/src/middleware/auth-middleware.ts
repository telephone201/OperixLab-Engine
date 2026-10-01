import type { NextFunction, Request, Response } from 'express';
import { authSessionService } from '../services/auth/auth-session-service';
import type { AppUserRole } from '../services/auth/app-user-service';
import { auditLogger } from '../core/logging/audit-logger';

function extractBearerToken(request: Request): string | null {
    const authorization = request.header('authorization');

    if (!authorization) {
        return null;
    }

    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());

    if (!match) {
        return null;
    }

    return match[1];
}

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const token = extractBearerToken(req);

        if (!token) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
            return;
        }

        const user = await authSessionService.getSessionByToken(token);

        if (!user) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
            return;
        }

        req.user = user;
        next();
    } catch {
        res.status(401).json({
            error: {
                code: 'UNAUTHENTICATED',
                message: 'Authentication required'
            }
        });
    }
}

export function requireRole(
    ...allowedRoles: AppUserRole[]
) {
    return (
        req: Request,
        res: Response,
        next: NextFunction
    ): void => {
        const user = req.user;

        if (!user) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
            return;
        }

        if (!allowedRoles.includes(user.role)) {
            void auditLogger.log({
                userId: user.id,
                action: 'AUTHZ_DENIED',
                entityType: 'HTTP_ROUTE',
                details: {
                    method: req.method,
                    path: req.originalUrl || req.path,
                    requiredRoles: allowedRoles,
                    actualRole: user.role
                }
            }).catch(() => {
                // Audit failures must never alter authorization behavior.
            });

            res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions'
                }
            });
            return;
        }

        next();
    };
}


