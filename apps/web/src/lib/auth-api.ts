import { apiClient } from './api-client';

export type AppUserRole = 'OWNER' | 'OPERATOR' | 'VIEWER';

export interface AuthUser {
    id: string;
    email: string;
    role: AppUserRole;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    accessToken: string;
    expiresAt: string;
    user: AuthUser;
}

export interface LogoutResponse {
    loggedOut: true;
}

export const authApi = {
    async login(credentials: LoginRequest): Promise<LoginResponse> {
        const response = await apiClient.post<LoginResponse>(
            '/auth/login',
            credentials
        );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    },

    async logout(): Promise<LogoutResponse> {
        const response = await apiClient.post<LogoutResponse>(
            '/auth/logout',
            undefined
        );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    }
};
