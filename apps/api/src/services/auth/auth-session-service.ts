import { db } from '../../lib/db';
import {
    generateSessionToken,
    hashSessionToken
} from './auth-crypto-service';
import type { AppUserRole } from './app-user-service';

const DEFAULT_SESSION_DAYS = 7;

export interface AuthenticatedSession {
    token: string;
    expiresAt: Date;
    user: {
        id: string;
        email: string;
        role: AppUserRole;
    };
}

interface AppUserRow {
    id: string;
    email: string;
    role: AppUserRole;
    is_active: boolean;
}

interface AuthSessionRow {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
}

function mapUser(row: AppUserRow) {
    return {
        id: row.id,
        email: row.email,
        role: row.role
    };
}

export class AuthSessionService {
    async createSession(
        userId: string,
        days: number = DEFAULT_SESSION_DAYS
    ): Promise<AuthenticatedSession> {
        const trimmedUserId = userId.trim();

        if (!trimmedUserId) {
            throw new Error('User ID is required');
        }

        if (!Number.isInteger(days) || days <= 0 || days > 30) {
            throw new Error('Invalid session duration');
        }

        const user = await db.app_users.findUnique({
            where: { id: trimmedUserId }
        }) as AppUserRow | null;

        if (!user || !user.is_active) {
            throw new Error('User not found or inactive');
        }

        const token = generateSessionToken();
        const tokenHash = hashSessionToken(token);
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await db.auth_sessions.create({
            data: {
                user_id: user.id,
                token_hash: tokenHash,
                expires_at: expiresAt
            }
        });

        return {
            token,
            expiresAt,
            user: mapUser(user)
        };
    }

    async getSessionByToken(token: string): Promise<AuthenticatedSession['user'] | null> {
        if (typeof token !== 'string' || token.trim().length === 0) {
            return null;
        }

        const tokenHash = hashSessionToken(token);

        const result = await db.query(
            `
            SELECT
                s.id,
                s.user_id,
                s.token_hash,
                s.expires_at,
                s.revoked_at,
                u.id AS user_id,
                u.email,
                u.role,
                u.is_active
            FROM auth_sessions s
            INNER JOIN app_users u ON u.id = s.user_id
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > CURRENT_TIMESTAMP
              AND u.is_active = TRUE
            LIMIT 1
            `,
            [tokenHash]
        );

        const row = result.rows[0] as (AuthSessionRow & {
            email: string;
            role: AppUserRole;
            is_active: boolean;
        }) | undefined;

        if (!row) {
            return null;
        }

        return {
            id: row.user_id,
            email: row.email,
            role: row.role
        };
    }

    async revokeSession(token: string): Promise<boolean> {
        if (typeof token !== 'string' || token.trim().length === 0) {
            return false;
        }

        const tokenHash = hashSessionToken(token);

        const result = await db.query(
            `
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = $1
              AND revoked_at IS NULL
            `,
            [tokenHash]
        );

        return Number(result.rowCount || 0) > 0;
    }
}

export const authSessionService = new AuthSessionService();
