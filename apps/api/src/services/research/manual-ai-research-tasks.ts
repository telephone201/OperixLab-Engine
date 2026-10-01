/**
 * @file manual-ai-research-tasks.ts
 * @description Manages manual AI research tasks persisted in PostgreSQL.
 */

import crypto from 'crypto';
import { db } from '../../lib/db';

export interface PersistedResearchResult {
    researchId: string;
    researchVersionId: string;
    researchDataId: string;
    leadId: string;
}

export interface ManualResearchTask {
    id: string;
    companyId: string;
    provider: 'PERPLEXITY' | 'GEMINI';
    generatedPrompt: string;
    status: 'READY' | 'COPIED' | 'RESULT_SUBMITTED' | 'REVIEWED' | 'APPROVED';
    result: string | null;
    createdAt: Date;
    updatedAt: Date;
    researchRequestId: string;
}

export class ManualAIResearchService {
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

    async createTask(
        companyId: string,
        provider: 'PERPLEXITY' | 'GEMINI'
    ): Promise<ManualResearchTask> {
        const taskId = crypto.randomUUID();
        const researchRequestId = crypto.randomUUID();

        return db.transaction(async (client) => {
            const requestResult = await client.query(
                `
                INSERT INTO "research_requests" (
                    "id",
                    "lead_id",
                    "status",
                    "created_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, NOW(), NOW())
                RETURNING "id", "status", "created_at", "updated_at"
                `,
                [
                    researchRequestId,
                    companyId,
                    'PENDING'
                ]
            );

            const taskResult = await client.query(
                `
                INSERT INTO "manual_ai_tasks" (
                    "id",
                    "task_type",
                    "provider",
                    "generated_prompt",
                    "status",
                    "related_entity_id",
                    "research_request_id",
                    "created_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING
                    "id",
                    "provider",
                    "generated_prompt",
                    "status",
                    "result",
                    "related_entity_id",
                    "created_at",
                    "updated_at"
                `,
                [
                    taskId,
                    'RESEARCH',
                    provider,
                    'Generating...',
                    'READY',
                    companyId,
                    researchRequestId
                ]
            );

            const row = taskResult.rows[0];

            return {
                id: row.id,
                companyId: row.related_entity_id,
                provider: row.provider,
                generatedPrompt: row.generated_prompt,
                status: row.status,
                result: row.result,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                researchRequestId
            };
        });
    }

    async submitResult(taskId: string, result: string): Promise<void> {
        const existingTask = await db.manual_ai_tasks.findUnique({
            where: { id: taskId }
        });

        if (!existingTask) {
            throw new Error('Manual AI research task not found');
        }

        if (existingTask.status === 'REVIEWED') {
            throw new Error('RESEARCH_TASK_ALREADY_REVIEWED');
        }

        await db.manual_ai_tasks.update({
            where: { id: taskId },
            data: {
                result,
                status: 'RESULT_SUBMITTED',
                result_source: 'MANUAL',
                updated_at: new Date()
            }
        });
    }

    async getTask(id: string): Promise<ManualResearchTask | null> {
        const row = await db.manual_ai_tasks.findUnique({
            where: { id }
        });

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            companyId: row.related_entity_id,
            provider: row.provider,
            generatedPrompt: row.generated_prompt,
            status: row.status,
            result: row.result,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            researchRequestId: row.research_request_id
        };
    }

    async persistResearchResult(
        taskId: string,
        evidence: Array<{
            text: string;
            sourceUrl?: string | null;
            confidence?: number | null;
        }>
    ): Promise<PersistedResearchResult> {
        const task = await db.manual_ai_tasks.findUnique({
            where: { id: taskId }
        });

        if (!task) {
            throw new Error('Manual AI research task not found');
        }

        if (!task.result) {
            throw new Error('Manual AI research task has no submitted result');
        }

        if (!task.research_request_id) {
            throw new Error('Manual AI research task has no linked research request');
        }

        if (task.status === 'REVIEWED') {
            throw new Error('RESEARCH_TASK_ALREADY_REVIEWED');
        }

        const researchRequest = await db.research_requests.findUnique({
            where: { id: task.research_request_id }
        });

        if (researchRequest?.status === 'COMPLETED') {
            throw new Error('RESEARCH_REQUEST_ALREADY_COMPLETED');
        }

        const lead = await db.leads.findUnique({
            where: { id: task.related_entity_id }
        });

        if (!lead) {
            throw new Error('Lead associated with research task not found');
        }

        if (!lead.company_id) {
            throw new Error('Lead has no associated company');
        }

        const researchId = crypto.randomUUID();
        const researchVersionId = crypto.randomUUID();
        const researchDataId = crypto.randomUUID();

        await db.transaction(async (client) => {
            // Idempotency guard: serialize concurrent submissions of the same
            // task, then re-check both statuses inside the transaction so a
            // second submission can never create duplicate research rows.
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                [taskId]
            );

            const taskStatusResult = await client.query(
                `SELECT "status" FROM "manual_ai_tasks" WHERE "id" = $1`,
                [taskId]
            );

            if (taskStatusResult.rows[0]?.status === 'REVIEWED') {
                throw new Error('RESEARCH_TASK_ALREADY_REVIEWED');
            }

            const requestStatusResult = await client.query(
                `SELECT "status" FROM "research_requests" WHERE "id" = $1 FOR UPDATE`,
                [task.research_request_id]
            );

            if (requestStatusResult.rows[0]?.status === 'COMPLETED') {
                throw new Error('RESEARCH_REQUEST_ALREADY_COMPLETED');
            }

            const firstEvidence = evidence[0];

            await client.query(
                `
                INSERT INTO "research" (
                    "id",
                    "company_id",
                    "source",
                    "observed_fact",
                    "confidence",
                    "source_type",
                    "url",
                    "created_at"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                `,
                [
                    researchId,
                    lead.company_id,
                    task.provider,
                    firstEvidence?.text || 'Manual AI research result submitted.',
                    firstEvidence?.confidence ?? null,
                    'MANUAL_AI',
                    firstEvidence?.sourceUrl ?? null
                ]
            );

            await client.query(
                `
                INSERT INTO "research_versions" (
                    "id",
                    "research_id",
                    "version_number",
                    "is_current",
                    "created_at",
                    "completed_at"
                )
                VALUES ($1, $2, $3, true, NOW(), NOW())
                `,
                [
                    researchVersionId,
                    researchId,
                    1
                ]
            );

            await client.query(
                `
                INSERT INTO "research_data" (
                    "id",
                    "request_id",
                    "research_version_id",
                    "data",
                    "created_at"
                )
                VALUES ($1, $2, $3, $4::jsonb, NOW())
                `,
                [
                    researchDataId,
                    task.research_request_id,
                    researchVersionId,
                    JSON.stringify({
                        provider: task.provider,
                        taskId: task.id,
                        result: task.result
                    })
                ]
            );

            for (const item of evidence) {
                await client.query(
                    `
                    INSERT INTO "research_evidence" (
                        "id",
                        "research_id",
                        "evidence_text",
                        "source_url",
                        "timestamp"
                    )
                    VALUES ($1, $2, $3, $4, NOW())
                    `,
                    [
                        crypto.randomUUID(),
                        researchId,
                        item.text,
                        item.sourceUrl ?? null
                    ]
                );
            }

            await client.query(
                `
                UPDATE "manual_ai_tasks"
                SET "status" = $1,
                    "research_version_id" = $2,
                    "updated_at" = NOW()
                WHERE "id" = $3
                `,
                ['REVIEWED', researchVersionId, taskId]
            );

            await client.query(
                `
                UPDATE "research_requests"
                SET "status" = $1,
                    "updated_at" = NOW()
                WHERE "id" = $2
`,
                ['COMPLETED', task.research_request_id]
            );
        });

        return {
            researchId,
            researchVersionId,
            researchDataId,
            leadId: task.related_entity_id
        };
    }
}

export const manualAIResearchService = new ManualAIResearchService();






