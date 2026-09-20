/**
 * @file auth.ts
 * @description Authentication abstractions for the Operix Dashboard.
 */

export interface User {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'OPERATOR';
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export const AuthDefaults = {
    MOCK_USER: {
        id: 'user_admin_123',
        email: 'admin@operix.ai',
        name: 'Operix Admin',
        role: 'ADMIN'
    } as User
};
