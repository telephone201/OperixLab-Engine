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
     * Uses a layered deterministic strategy:
     * 1. Integration Match
     * 2. Category Match
     * 3. Keyword/Capability Match
     */
    async search(params: SearchParams): Promise<Candidate[]> {
        console.log('[SEARCH] Initiating candidate discovery...');

        const tokens = this.extractSearchTokens(params.requirements);
        const requiredIntegrations = this.extractRequiredIntegrations(params.requirements);

        const keywordConditions = tokens.keywords.flatMap((keyword) => [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { description: { contains: keyword, mode: 'insensitive' as const } }
        ]);

        const orConditions: any[] = [];

        if (tokens.categories.length > 0) {
            orConditions.push({
                category: { in: tokens.categories }
            });
        }

        if (requiredIntegrations.length > 0) {
            orConditions.push({
                integrations: { hasSome: requiredIntegrations }
            });
        }

        orConditions.push(...keywordConditions);

        const candidates = await db.workflow_library.findMany({
            where: {
                OR: orConditions,
                ...(params.categoryFilter && {
                    category: { equals: params.categoryFilter }
                }),
                ...(params.minQualityScore !== undefined && {
                    quality_score: { gte: params.minQualityScore }
                })
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
        const categories = new Set<string>();
        const keywords = new Set<string>();

        const stopWords = new Set([
            'about',
            'after',
            'also',
            'associated',
            'before',
            'being',
            'business',
            'capture',
            'consistent',
            'could',
            'identified',
            'information',
            'must',
            'relevant',
            'should',
            'solution',
            'that',
            'their',
            'these',
            'this',
            'those',
            'with'
        ]);

        const capabilityAliases: Record<string, string[]> = {
            issue: ['incident', 'alert'],
            review: ['report', 'monitoring'],
            operational: ['monitoring', 'incident']
        };

        requirements.forEach(req => {
            if (req.category) {
                categories.add(req.category);
            }

            const text = [
                req.title || '',
                req.description || ''
            ].join(' ');

            const words = text
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, ' ')
                .split(/\s+/)
                .map((word: string) => word.trim())
                .filter((word: string) =>
                    word.length > 4 &&
                    !stopWords.has(word)
                );

            words.forEach((word: string) => {
                keywords.add(word);

                const aliases = capabilityAliases[word];

                if (aliases) {
                    aliases.forEach(alias => keywords.add(alias));
                }
            });
        });

        return {
            categories: Array.from(categories),
            keywords: Array.from(keywords)
        };
    }

    private extractRequiredIntegrations(requirements: any[]) {
        const integrations = new Set<string>();

        requirements.forEach(req => {
            if (req.integration_requirements) {
                const tools = Array.isArray(req.integration_requirements)
                    ? req.integration_requirements
                    : (req.integration_requirements as string).split(',');

                tools.forEach((t: string) => {
                    const normalized = t.trim();

                    if (normalized) {
                        integrations.add(normalized);
                    }
                });
            }
        });

        return Array.from(integrations);
    }
}
