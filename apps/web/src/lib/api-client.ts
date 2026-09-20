/**
 * @file api-client.ts
 * @description Centralized API client for the Operix Operator Dashboard.
 */

export interface ApiResponse<T> {
    data: T;
    error?: {
        code: string;
        message: string;
    };
}

class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Auth interceptor: Add token from localStorage if present
        const token = localStorage.getItem('operix_auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, { ...options, headers });

            if (response.status === 401) {
                // Handle unauthorized - e.g., trigger logout
                return { data: null as any, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    data: null as any,
                    error: {
                        code: errorData.code || 'API_ERROR',
                        message: errorData.message || `HTTP ${response.status}`
                    }
                };
            }

            const data = await response.json();
            return { data };
        } catch (error: any) {
            return {
                data: null as any,
                error: {
                    code: 'NETWORK_ERROR',
                    message: error.message || 'Failed to connect to API'
                }
            };
        }
    }

    async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    async post<T>(endpoint: string, body: any, options?: RequestInit): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    async put<T>(endpoint: string, body: any, options?: RequestInit): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
}

export const apiClient = new ApiClient();
