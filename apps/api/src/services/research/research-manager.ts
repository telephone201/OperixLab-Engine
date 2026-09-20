/**
 * @file research-manager.ts
 * @description Manages the lifecycle of research requests and versions.
 */

export interface ResearchRequest {
    companyId: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    objectives: string[];
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    createdAt: Date;
    updatedAt: Date;
}

export class ResearchManager {
    // In-memory store for now; backed by 'research' and 'research_versions' tables.
    private requests: Map<string, ResearchRequest> = new Map();

    async createRequest(companyId: string, objectives: string[] = []): Promise<ResearchRequest> {
        const id = crypto.randomUUID();
        const request: ResearchRequest = {
            companyId,
            priority: 'MEDIUM',
            objectives,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.requests.set(id, request);
        return request;
    }

    async updateStatus(requestId: string, status: ResearchRequest['status']): Promise<void> {
        const request = this.requests.get(requestId);
        if (!request) throw new Error('Research request not found');

        request.status = status;
        request.updatedAt = new Date();
        this.requests.set(requestId, request);
    }

    async getRequest(id: string): Promise<ResearchRequest | null> {
        return this.requests.get(id) || null;
    }
}

export const researchManager = new ResearchManager();
