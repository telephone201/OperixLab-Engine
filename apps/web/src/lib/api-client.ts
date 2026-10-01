/**
 * @file api-client.ts
 * @description Centralized API client for the Operix Operator Dashboard.
 */

import { notifyAuthSessionExpired } from './auth';

export interface ApiResponse<T> {
    data: T;
    error?: {
        code: string;
        message: string;
    };
}

interface ApiEnvelope<T> {
    data: T;
}

class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl =
            process.env.NEXT_PUBLIC_API_BASE_URL ||
            'http://localhost:3000/api';
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = new Headers(options.headers);
        if (!(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const token =
            typeof window !== 'undefined'
                ? localStorage.getItem('operix_auth_token')
                : null;

        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        try {
            const response = await fetch(url, { ...options, headers });

            const body = await response.json().catch(() => null);

            if (response.status === 401) {
                const authErrorCode =
                    body?.error?.code || 'UNAUTHORIZED';

                if (
                    endpoint !== '/auth/login' &&
                    endpoint !== '/auth/logout'
                ) {
                    notifyAuthSessionExpired();
                }

                return {
                    data: null as any,
                    error: {
                        code: authErrorCode,
                        message:
                            body?.error?.message ||
                            'Authentication required',
                    },
                };
            }

            if (!response.ok) {
                return {
                    data: null as any,
                    error: {
                        code:
                            body?.error?.code ||
                            body?.code ||
                            'API_ERROR',
                        message:
                            body?.error?.message ||
                            body?.message ||
                            `HTTP ${response.status}`,
                    },
                };
            }

            const payload =
                body &&
                typeof body === 'object' &&
                'data' in body
                    ? (body as ApiEnvelope<T>).data
                    : body;

            return {
                data: payload as T,
            };
        } catch (error: any) {
            return {
                data: null as any,
                error: {
                    code: 'NETWORK_ERROR',
                    message:
                        error.message ||
                        'Failed to connect to API',
                },
            };
        }
    }

    async get<T>(
        endpoint: string,
        options?: RequestInit
    ): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'GET',
        });
    }

    async post<T>(
        endpoint: string,
        body?: any,
        options?: RequestInit
    ): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            ...(body !== undefined
                ? { body: JSON.stringify(body) }
                : {}),
        });
    }

    async postFormData<T>(
        endpoint: string,
        formData: FormData,
        options?: RequestInit
    ): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: formData,
        });
    }

    async put<T>(
        endpoint: string,
        body: any,
        options?: RequestInit
    ): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    async delete<T>(
        endpoint: string,
        options?: RequestInit
    ): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'DELETE',
        });
    }
}

export const apiClient = new ApiClient();
