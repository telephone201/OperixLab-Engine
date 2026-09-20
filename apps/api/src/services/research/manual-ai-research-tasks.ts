/**
 * @file manual-ai-research-tasks.ts
 * @description Manages the generation and submission of manual AI research tasks (Perplexity/Gemini).
 */

import { config } from '../../config/config-manager';

export interface ManualResearchTask {
    id: string;
    companyId: string;
    provider: 'PERPLEXITY' | 'GEMINI';
    generatedPrompt: string;
    status: 'READY' | 'COPIED' | 'RESULT_SUBMITTED' | 'REVIEWED' | 'APPROVED';
    result: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export class ManualAIResearchService {
    // In-memory store for now; backed by 'manual_ai_tasks' table in DB.
    private tasks: Map<string, ManualResearchTask> = new Map();

    /**
     * Generates a highly structured prompt for the user to copy into Perplexity Pro.
     */
    async generatePerplexityPrompt(company: any): Promise<string> {
        return `
--- OPERIX RESEARCH PROMPT ---
Role: Expert Business Intelligence Analyst
Objective: Conduct deep research on the company: ${company.name}
Website: ${company.website || 'UNKNOWN'}
Industry: ${company.industry || 'UNKNOWN'}
Location: ${company.city || 'UNKNOWN'}

Please provide the following in a structured format:
1. Business Model: How do they make money? Who is their target customer?
2. Operational Signals: Do they use online booking, chat widgets, or automated forms?
3. Customer Journey: How does a new customer typically interact with them?
4. Technology Stack: Any visible CRM, ERP, or automation tools?
5. Decision Maker: Who is likely the owner or head of operations?

CONSTRAINTS:
- Provide source URLs for every claim.
- Distinguish clearly between VERIFIED facts and INFERRED assumptions.
- If information is unavailable, mark it as UNKNOWN.
- Do not invent information.

Please output the result in a format that is easy to parse.
--- END PROMPT ---
        `.trim();
    }

    async createTask(companyId: string, provider: 'PERPLEXITY' | 'GEMINI'): Promise<ManualResearchTask> {
        const id = crypto.randomUUID();
        const task: ManualResearchTask = {
            id,
            companyId,
            provider,
            generatedPrompt: 'Generating...', // In real flow, this is called immediately
            status: 'READY',
            result: null,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.tasks.set(id, task);
        return task;
    }

    async submitResult(taskId: string, result: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) throw new Error('Task not found');

        task.result = result;
        task.status = 'RESULT_SUBMITTED';
        task.updatedAt = new Date();
        this.tasks.set(taskId, task);
    }

    async getTask(id: string): Promise<ManualResearchTask | null> {
        return this.tasks.get(id) || null;
    }
}

export const manualAIResearchService = new ManualAIResearchService();
