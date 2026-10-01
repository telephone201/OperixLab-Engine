/**
 * @file auth.ts
 * @description Authentication types and session lifecycle helpers.
 */

export type AppUserRole = 'OWNER' | 'OPERATOR' | 'VIEWER';

export interface User {
    id: string;
    email: string;
    role: AppUserRole;
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresAt: string | null;
}

type AuthSessionExpiredHandler = () => void;

let authSessionExpiredHandler: AuthSessionExpiredHandler | null = null;

export function registerAuthSessionExpiredHandler(
    handler: AuthSessionExpiredHandler
): () => void {
    authSessionExpiredHandler = handler;

    return () => {
        if (authSessionExpiredHandler === handler) {
            authSessionExpiredHandler = null;
        }
    };
}

export function notifyAuthSessionExpired(): void {
    authSessionExpiredHandler?.();
}
