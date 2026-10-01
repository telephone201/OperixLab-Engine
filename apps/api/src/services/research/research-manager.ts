import crypto from 'crypto';
import { db } from '../../lib/db';

export interface ResearchRequest {
    id: string;
    leadId: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    objectives: string[];
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    createdAt: Date;
    updatedAt: Date;
}

export class ResearchManager {
    async createRequest(
        leadId: string,
        objectives: string[] = []
    ): Promise<ResearchRequest> {
        const id = crypto.randomUUID();

        const row = await db.research_requests.create({
            data: {
                id,
                lead_id: leadId,
                status: 'PENDING'
            }
        });

        return {
            id: row.id,
            leadId: row.lead_id,
            priority: 'MEDIUM',
            objectives,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async updateStatus(
        requestId: string,
        status: ResearchRequest['status']
    ): Promise<void> {
        await db.research_requests.update({
            where: { id: requestId },
            data: {
                status,
                updated_at: new Date()
            }
        });
    }

    async getRequest(id: string): Promise<ResearchRequest | null> {
        const row = await db.research_requests.findUnique({
            where: { id }
        });

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            leadId: row.lead_id,
            priority: 'MEDIUM',
            objectives: [],
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const researchManager = new ResearchManager();
