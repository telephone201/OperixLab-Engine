/**
 * @file n8n-provider.ts
 * @description Concrete implementation of IDeploymentProvider for the n8n API.
 */

import { IDeploymentProvider } from './deployment-provider.interface';
import axios, { AxiosInstance } from 'axios';

export class N8NProvider implements IDeploymentProvider {
    private client: AxiosInstance;

    constructor() {
        const baseUrl = process.env.N8N_BASE_URL;
        const apiKey = process.env.N8N_API_KEY;

        if (!baseUrl || !apiKey) {
            // We don't throw in constructor to allow the service to handle
            // N8N_NOT_CONFIGURED error gracefully.
        }

        this.client = axios.create({
            baseURL: baseUrl ? `${baseUrl}/api/v1` : '',
            headers: {
                'X-N8N-API-KEY': apiKey || '',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
    }

    public async getWorkflow(id: string) {
        try {
            const response = await this.client.get(`/workflows/${id}`);
            const data = response.data;
            return {
                id: data.id,
                name: data.name,
                nodes: data.nodes,
                connections: data.connections,
                active: data.active
            };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    public async createWorkflow(name: string, content: any) {
        try {
            const response = await this.client.post('/workflows', {
                name,
                nodes: content.nodes,
                connections: content.connections,
                settings: content.settings || {}
            });
            return { id: response.data.id };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    public async updateWorkflow(id: string, content: any) {
        try {
            const response = await this.client.put(`/workflows/${id}`, {
                nodes: content.nodes,
                connections: content.connections,
                settings: content.settings || {}
            });
            return { id: response.data.id };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    public async activateWorkflow(id: string) {
        try {
            await this.client.put(`/workflows/${id}/activate`);
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    public async deactivateWorkflow(id: string) {
        try {
            await this.client.put(`/workflows/${id}/deactivate`);
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    public async getWorkflowStatus(id: string) {
        try {
            const workflow = await this.getWorkflow(id);
            return {
                status: 'OK',
                active: workflow.active
            };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    private handleError(error: any) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status === 401 || status === 403) return new Error('N8N_AUTH_FAILED');
            if (status === 404) return new Error('N8N_WORKFLOW_NOT_FOUND');
            if (status && status >= 500) return new Error('N8N_UNREACHABLE');
        }
        return error;
    }
}

export const n8nProvider = new N8NProvider();
