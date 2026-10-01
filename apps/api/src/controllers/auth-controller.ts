import { Request, Response } from 'express';
import { authService } from '../services/auth/auth-service';

function extractBearerToken(req: Request): string | null {
    const authorization = req.header('authorization');

    if (!authorization) {
        return null;
    }

    const match = /^Bearer\s+([^\s]+)$/i.exec(
        authorization.trim()
    );

    return match ? match[1] : null;
}

export class AuthController {
    /**
     * POST /api/auth/login
     * Authenticates a user and creates a session.
     */
    async login(req: Request, res: Response) {
        try {
            const email = String(req.body?.email || '').trim();
            const password = req.body?.password;

            if (!email || typeof password !== 'string' || password.length === 0) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Email and password are required'
                    }
                });
            }

            const session = await authService.login(
                email,
                password
            );

            return res.json({
                data: {
                    accessToken: session.token,
                    expiresAt: session.expiresAt,
                    user: session.user
                }
            });
        } catch (error: any) {
            if (error?.message === 'Invalid credentials') {
                return res.status(401).json({
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: 'Invalid credentials'
                    }
                });
            }

            return res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error?.message || 'Internal server error'
                }
            });
        }
    }

    /**
     * POST /api/auth/logout
     * Revokes the current bearer session.
     */
    async logout(req: Request, res: Response) {
        try {
            const token = extractBearerToken(req);

            if (!token) {
                return res.status(401).json({
                    error: {
                        code: 'UNAUTHENTICATED',
                        message: 'Authentication required'
                    }
                });
            }

            await authService.logout(token);

            return res.json({
                data: {
                    loggedOut: true
                }
            });
        } catch {
            return res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
        }
    }
}

export const authController = new AuthController();
