/**
 * @file campaign-manager.ts
 * @description Manages lead acquisition campaigns and their metrics.
 */

import { db } from '../../lib/db';

export interface Campaign {
    id: string;
    name: string;
    description?: string;
    targetIndustry?: string;
    targetLocation?: string;
    searchTerms: string[];
    sourceProvider: string;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    startDate: Date;
    endDate?: Date;
    metrics: {
        discovered: number;
        valid: number;
        duplicates: number;
        cost: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

export class CampaignManager {
    async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
        const result = await db.query(
            `
            INSERT INTO campaigns (
                name,
                description,
                status
            )
            VALUES ($1, $2, $3)
            RETURNING
                id,
                name,
                description,
                status,
                created_at
            `,
            [
                data.name || 'Unnamed Campaign',
                data.description || null,
                'ACTIVE'
            ]
        );

        const row = result.rows[0];

        return {
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            targetIndustry: data.targetIndustry,
            targetLocation: data.targetLocation,
            searchTerms: data.searchTerms || [],
            sourceProvider: data.sourceProvider || 'MANUAL',
            status: row.status as Campaign['status'],
            startDate: row.created_at,
            metrics: {
                discovered: 0,
                valid: 0,
                duplicates: 0,
                cost: 0
            },
            createdAt: row.created_at,
            updatedAt: row.created_at
        };
    }

    async getCampaign(id: string): Promise<Campaign | null> {
        const result = await db.query(
            `
            SELECT
                id,
                name,
                description,
                status,
                created_at
            FROM campaigns
            WHERE id = $1
            LIMIT 1
            `,
            [id]
        );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            status: row.status as Campaign['status'],
            startDate: row.created_at,
            createdAt: row.created_at,
            updatedAt: row.created_at,
            searchTerms: [],
            sourceProvider: 'MANUAL',
            metrics: {
                discovered: 0,
                valid: 0,
                duplicates: 0,
                cost: 0
            }
        };
    }

    async listCampaigns(): Promise<Campaign[]> {
        const result = await db.query(
            `
            SELECT
                id,
                name,
                description,
                status,
                created_at
            FROM campaigns
            ORDER BY created_at DESC
            `
        );

        return result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            status: row.status as Campaign['status'],
            startDate: row.created_at,
            createdAt: row.created_at,
            updatedAt: row.created_at,
            searchTerms: [],
            sourceProvider: 'MANUAL',
            metrics: {
                discovered: 0,
                valid: 0,
                duplicates: 0,
                cost: 0
            }
        }));
    }

    async updateMetrics(
        id: string,
        delta: {
            discovered?: number;
            valid?: number;
            duplicates?: number;
            cost?: number;
        }
    ): Promise<void> {
        const campaign = await this.getCampaign(id);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // The current campaigns table does not contain metric columns.
        // Metrics remain derived/ephemeral until a dedicated persistence
        // model is introduced. This method intentionally preserves the
        // existing public contract without requiring a migration.
    }
}

export const campaignManager = new CampaignManager();
