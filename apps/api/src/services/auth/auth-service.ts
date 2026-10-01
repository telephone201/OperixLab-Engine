import { appUserService, type AppUser } from './app-user-service';
import { authSessionService, type AuthenticatedSession } from './auth-session-service';
import { verifyPassword } from './auth-crypto-service';
import { db } from '../../lib/db';

interface AppUserWithPassword {
    id: string;
    email: string;
    password_hash: string;
    role: AppUser['role'];
    is_active: boolean;
}

export class AuthService {
    async login(
        email: string,
        password: string
    ): Promise<AuthenticatedSession> {
        const normalizedEmail = email.trim().toLowerCase();

        const result = await db.query(
            `
            SELECT
                id,
                email,
                password_hash,
                role,
                is_active
            FROM app_users
            WHERE email = $1
            LIMIT 1
            `,
            [normalizedEmail]
        );

        const user = result.rows[0] as AppUserWithPassword | undefined;

        if (!user || !user.is_active) {
            throw new Error('Invalid credentials');
        }

        const passwordValid = await verifyPassword(
            password,
            user.password_hash
        );

        if (!passwordValid) {
            throw new Error('Invalid credentials');
        }

        return authSessionService.createSession(user.id);
    }

    async logout(token: string): Promise<boolean> {
        return authSessionService.revokeSession(token);
    }
}

export const authService = new AuthService();
