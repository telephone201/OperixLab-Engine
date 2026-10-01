"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState
} from 'react';
import type { User, AuthState } from '@/lib/auth';
import { registerAuthSessionExpiredHandler } from '@/lib/auth';
import { authApi } from '@/lib/auth-api';

interface AuthContextType extends AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresAt: string | null;
    login: (token: string, user: User, expiresAt: string) => void;
    logout: () => Promise<void>;
    clearSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'operix_auth_token';
const USER_STORAGE_KEY = 'operix_auth_user';
const EXPIRES_AT_STORAGE_KEY = 'operix_auth_expires_at';

function clearStoredSession(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(EXPIRES_AT_STORAGE_KEY);
}

function readStoredSession(): {
    token: string;
    user: User;
    expiresAt: string;
} | null {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const userJson = localStorage.getItem(USER_STORAGE_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_AT_STORAGE_KEY);

    if (!token || !userJson || !expiresAt) {
        return null;
    }

    try {
        const user = JSON.parse(userJson) as User;

        if (
            !user ||
            typeof user.id !== 'string' ||
            typeof user.email !== 'string' ||
            !['OWNER', 'OPERATOR', 'VIEWER'].includes(user.role)
        ) {
            return null;
        }

        const expiryTime = new Date(expiresAt).getTime();

        if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
            return null;
        }

        return {
            token,
            user,
            expiresAt
        };
    } catch {
        return null;
    }
}

export function AuthProvider({
    children
}: {
    children: React.ReactNode;
}) {
    const [state, setState] = useState<AuthState>({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        expiresAt: null
    });

    const clearSession = () => {
        clearStoredSession();

        setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            expiresAt: null
        });
    };

    useEffect(() => {
        const unregister = registerAuthSessionExpiredHandler(() => {
            clearSession();
        });

        const storedSession = readStoredSession();

        if (!storedSession) {
            clearStoredSession();

            setState({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                expiresAt: null
            });

            unregister();
            return;
        }

        setState({
            user: storedSession.user,
            isAuthenticated: true,
            isLoading: false,
            expiresAt: storedSession.expiresAt
        });

        const remainingMs =
            new Date(storedSession.expiresAt).getTime() - Date.now();

        const timeoutId = window.setTimeout(() => {
            clearSession();
        }, remainingMs);

        return () => {
            window.clearTimeout(timeoutId);
            unregister();
        };
    }, []);

    const login = (
        token: string,
        user: User,
        expiresAt: string
    ) => {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(EXPIRES_AT_STORAGE_KEY, expiresAt);

        setState({
            user,
            isAuthenticated: true,
            isLoading: false,
            expiresAt
        });
    };

    const logout = async () => {
        try {
            if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
                await authApi.logout();
            }
        } finally {
            clearSession();
        }
    };

    return (
        <AuthContext.Provider
            value={{
                ...state,
                login,
                logout,
                clearSession
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}
