/**
 * @file workflow-candidate-search.ts
 * @description Implements candidate discovery from the workflow library using hybrid search.
 */

import { db } from '../../lib/db';

export interface SearchParams {
    requirements: any[];
    categoryFilter?: string;
    minQualityScore?: number;
}

export interface Candidate {
    id: string;
    workflow_id: string;
    name: string;
    category: string;
    integrations: string[];
    triggers: string[];
    quality_score: number;
}

export class WorkflowCandidateSearch {
    /**
     * Discovers potential workflow candidates based on requirement tokens.
     * Uses a layered strategy:
     * 1. Integration Match (High Priority)
     * 2. Category Match
     * 3. Keyword/Capability Match
     */
    async search(params: SearchParams): Promise<Candidate[]> {
        console.log('[SEARCH] Initiating candidate discovery...');

        // 1. Extract Search Tokens from requirements
        const tokens = this.extractSearchTokens(params.requirements);
        const requiredIntegrations = this.extractRequiredIntegrations(params.requirements);

        // 2. Build a deterministic SQL query to find candidates
        // In a real implementation, this would use a combination of JSONB search
        // and perhaps a local vector store if available.
        const candidates = await db.workflow_library.findMany({
            where: {
                OR: [
                    { category: { in: tokens.categories } },
                    { integrations: { hasSome: requiredIntegrations } },
                    { name: { contains: tokens.primaryKeyword, mode: 'insensitive' } },
                    { description: { contains: tokens.primaryKeyword, mode: 'insensitive' } }
                ],
                ...(params.minQualityScore && { quality_score: { gte: params.minQualityScore } })
            },
            orderBy: { quality_score: 'desc' },
            take: 50
        });

        return candidates.map(c => ({
            id: c.id,
            workflow_id: c.workflow_id,
            name: c.name,
            category: c.category,
            integrations: c.integrations,
            triggers: c.triggers,
            quality_score: c.quality_score
        }));
    }

    private extractSearchTokens(requirements: any[]) {
        // Simple tokenization logic
        const categories = new Set<string>();
        const keywords: string[] = [];

        requirements.forEach(req => {
            if (req.category) categories.add(req.category);
            // Basic keyword extraction from title/description
            const words = (req.title + ' ' + req.description).split(' ');
            words.forEach(w => {
                if (w.length > 4) keywords.push(w.toLowerCase());
            });
        });

        return {
            categories: Array.from(categories),
            primaryKeyword: keywords[0] || '',
            allKeywords: keywords
        };
    }

    private extractRequiredIntegrations(requirements: any[]) {
        const integrations = new Set<string>();
        requirements.forEach(req => {
            if (req.integration_requirements) {
                // Assuming integration_requirements is an array or comma-separated string
                const tools = Array.isArray(req.integration_requirements)
                    ? req.integration_requirements
                    : (req.integration_requirements as string).split(',');
                tools.forEach((t: string) => integrations.add(t.trim()));
            }
        });
        return Array.from(integrations);
    }
}

