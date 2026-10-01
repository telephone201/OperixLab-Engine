import crypto from 'crypto';
import { db } from '../../lib/db';

export type ManualAITaskType =
    | 'RESEARCH'
    | 'PAIN_ANALYSIS'
    | 'REQUIREMENTS_EXTRACTION';

export type ManualAIProvider = 'PERPLEXITY' | 'GEMINI';

export interface ManualAITaskVersionIdentity {
    researchVersionId?: string | null;
    qualificationVersionId?: string | null;
    /**
     * Persisted Pain analysis UUID (manual_ai_tasks.pain_analysis_id,
     * Migration 037). Set by Requirements initiation; never a caller-supplied
     * or pre-persistence Pain id.
     */
    painAnalysisId?: string | null;
}

export interface CreateManualAITaskInput {
    leadId: string;
    taskType: ManualAITaskType;
    provider: ManualAIProvider;
    prompt: string;
    /**
     * Optional persistent version identity stamped onto the task row at
     * creation (manual_ai_tasks.research_version_id / qualification_version_id,
     * Migration 037). Consumers re-read the task for the exact versions at
     * result time instead of resolving "latest" again.
     */
    versionIdentity?: ManualAITaskVersionIdentity;
}

export interface ManualAITask {
    id: string;
    leadId: string;
    taskType: ManualAITaskType;
    provider: ManualAIProvider;
    prompt: string;
    status: string;
    result: string | null;
    researchVersionId: string | null;
    qualificationVersionId: string | null;
    painAnalysisId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export class ManualAITaskService {
    async createTask(input: CreateManualAITaskInput): Promise<ManualAITask> {
        const taskId = crypto.randomUUID();

        const result = await db.query(
            `
            INSERT INTO "manual_ai_tasks" (
                "id",
                "task_type",
                "provider",
                "generated_prompt",
                "status",
                "related_entity_id",
                "research_version_id",
                "qualification_version_id",
                "pain_analysis_id",
                "created_at",
                "updated_at"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING
                "id",
                "task_type",
                "provider",
                "generated_prompt",
                "status",
                "result",
                "related_entity_id",
                "research_version_id",
                "qualification_version_id",
                "pain_analysis_id",
                "created_at",
                "updated_at"
            `,
            [
                taskId,
                input.taskType,
                input.provider,
                input.prompt,
                'READY',
                input.leadId,
                input.versionIdentity?.researchVersionId ?? null,
                input.versionIdentity?.qualificationVersionId ?? null,
                input.versionIdentity?.painAnalysisId ?? null
            ]
        );

        const row = result.rows[0];

        return {
            id: row.id,
            leadId: row.related_entity_id,
            taskType: row.task_type,
            provider: row.provider,
            prompt: row.generated_prompt,
            status: row.status,
            result: row.result,
            researchVersionId: row.research_version_id,
            qualificationVersionId: row.qualification_version_id,
            painAnalysisId: row.pain_analysis_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async getTask(taskId: string): Promise<ManualAITask | null> {
        const result = await db.query(
            `
            SELECT
                "id",
                "task_type",
                "provider",
                "generated_prompt",
                "status",
                "result",
                "related_entity_id",
                "research_version_id",
                "qualification_version_id",
                "pain_analysis_id",
                "created_at",
                "updated_at"
            FROM "manual_ai_tasks"
            WHERE "id" = $1
            `,
            [taskId]
        );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            leadId: row.related_entity_id,
            taskType: row.task_type,
            provider: row.provider,
            prompt: row.generated_prompt,
            status: row.status,
            result: row.result,
            researchVersionId: row.research_version_id,
            qualificationVersionId: row.qualification_version_id,
            painAnalysisId: row.pain_analysis_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async submitResult(taskId: string, result: string): Promise<void> {
        await db.query(
            `
            UPDATE "manual_ai_tasks"
            SET
                "result" = $1,
                "status" = 'RESULT_SUBMITTED',
                "result_source" = 'MANUAL',
                "updated_at" = NOW()
            WHERE "id" = $2
            `,
            [result, taskId]
        );
    }
}

export const manualAITaskService = new ManualAITaskService();
