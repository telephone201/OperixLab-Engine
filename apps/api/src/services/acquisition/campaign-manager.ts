/**
 * @file campaign-manager.ts
 * @description Manages lead acquisition campaigns and their metrics.
 */

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
    // In-memory store for now; will be backed by the 'campaigns' table in the DB.
    private campaigns: Map<string, Campaign> = new Map();

    async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
        const id = crypto.randomUUID();
        const campaign: Campaign = {
            id,
            name: data.name || 'Unnamed Campaign',
            description: data.description,
            targetIndustry: data.targetIndustry,
            targetLocation: data.targetLocation,
            searchTerms: data.searchTerms || [],
            sourceProvider: data.sourceProvider || 'MANUAL',
            status: 'ACTIVE',
            startDate: new Date(),
            metrics: {
                discovered: 0,
                valid: 0,
                duplicates: 0,
                cost: 0
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.campaigns.set(id, campaign);
        return campaign;
    }

    async getCampaign(id: string): Promise<Campaign | null> {
        return this.campaigns.get(id) || null;
    }

    async listCampaigns(): Promise<Campaign[]> {
        return Array.from(this.campaigns.values());
    }

    async updateMetrics(id: string, delta: { discovered?: number, valid?: number, duplicates?: number, cost?: number }): Promise<void> {
        const campaign = this.campaigns.get(id);
        if (!campaign) throw new Error('Campaign not found');

        if (delta.discovered) campaign.metrics.discovered += delta.discovered;
        if (delta.valid) campaign.metrics.valid += delta.valid;
        if (delta.duplicates) campaign.metrics.duplicates += delta.duplicates;
        if (delta.cost) campaign.metrics.cost += delta.cost;

        campaign.updatedAt = new Date();
        this.campaigns.set(id, campaign);
    }
}

export const campaignManager = new CampaignManager();
