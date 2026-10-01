/**
 * @file pain-version-manager.ts
 * @description Persists and retrieves historical versions of pain analysis.
 */

import crypto from 'crypto';
import { db } from '../../lib/db';
import { PainAnalysis, Pain } from './pain-types';

export interface PainTaskContext {
    taskId: string;
}

export class PainVersionManager {
    async saveVersion(
        analysis: PainAnalysis,
        taskContext?: PainTaskContext
    ): Promise<PainAnalysis> {
        await db.transaction(async (client) => {
            // Task-scoped idempotency (mandatory lock order: taskId -> leadId).
            // Serialize concurrent processing of the same manual AI task, then
            // re-read it inside the transaction so a replay after REVIEWED can
            // never create a second Pain version.
            if (taskContext) {
                await client.query(
                    `SELECT pg_advisory_xact_lock(hashtext($1))`,
                    [taskContext.taskId]
                );

                const taskResult = await client.query(
                    `
                    SELECT
                        "id",
                        "task_type",
                        "related_entity_id",
                        "status"
                    FROM "manual_ai_tasks"
                    WHERE "id" = $1
                    FOR UPDATE
                    `,
                    [taskContext.taskId]
                );

                const task = taskResult.rows[0];

                if (!task) {
                    throw new Error('PAIN_TASK_NOT_FOUND');
                }

                if (task.task_type !== 'PAIN_ANALYSIS') {
                    throw new Error('PAIN_TASK_TYPE_MISMATCH');
                }

                if (task.related_entity_id !== analysis.leadId) {
                    throw new Error('PAIN_TASK_LEAD_MISMATCH');
                }

                if (task.status === 'REVIEWED') {
                    throw new Error('PAIN_TASK_ALREADY_REVIEWED');
                }

                // Version identity validation: the Research and Qualification
                // versions supplied by the caller must exist. These exact IDs
                // are persisted onto both pain_analyses and manual_ai_tasks.
                const researchVersionResult = await client.query(
                    `SELECT "id" FROM "research_versions" WHERE "id" = $1`,
                    [analysis.researchVersionId]
                );

                if (!researchVersionResult.rows[0]) {
                    throw new Error('PAIN_RESEARCH_VERSION_NOT_FOUND');
                }

                const qualificationVersionResult = await client.query(
                    `SELECT "id" FROM "qualifications" WHERE "id" = $1`,
                    [analysis.qualificationVersionId]
                );

                if (!qualificationVersionResult.rows[0]) {
                    throw new Error('PAIN_QUALIFICATION_VERSION_NOT_FOUND');
                }
            }

            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                [analysis.leadId]
            );

            const latestResult = await client.query(
                `
                SELECT "analysis_version"
                FROM "pain_analyses"
                WHERE "lead_id" = $1
                ORDER BY "analysis_version" DESC
                LIMIT 1
                `,
                [analysis.leadId]
            );

            const latestVersion = latestResult.rows[0]
                ? Number(latestResult.rows[0].analysis_version)
                : 0;

            const analysisVersion = latestVersion + 1;
            const analysisId = crypto.randomUUID();

            await client.query(
                `
                INSERT INTO "pain_analyses" (
                    "id",
                    "lead_id",
                    "research_version_id",
                    "qualification_version_id",
                    "analysis_version",
                    "status",
                    "overall_confidence",
                    "primary_pain_id",
                    "created_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW(), NOW())
                `,
                [
                    analysisId,
                    analysis.leadId,
                    analysis.researchVersionId || null,
                    analysis.qualificationVersionId || null,
                    analysisVersion,
                    analysis.status,
                    analysis.overallConfidence
                ]
            );

            const painIds = new Map<string, string>();

            for (const pain of analysis.pains) {
                const painId = crypto.randomUUID();
                painIds.set(pain.id, painId);

                await client.query(
                    `
                    INSERT INTO "pains" (
                        "id",
                        "analysis_id",
                        "pain_type",
                        "title",
                        "description",
                        "evidence_type",
                        "severity",
                        "frequency",
                        "automation_relevance",
                        "confidence",
                        "status",
                        "priority",
                        "reasoning",
                        "source",
                        "version",
                        "created_at",
                        "updated_at"
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9,
                        $10, $11, $12, $13, $14, $15, NOW(), NOW()
                    )
                    `,
                    [
                        painId,
                        analysisId,
                        pain.painType,
                        pain.title,
                        pain.description,
                        pain.evidenceType,
                        pain.severity,
                        pain.frequency,
                        pain.automationRelevance,
                        pain.confidence,
                        pain.status,
                        pain.priority,
                        pain.reasoning,
                        pain.source,
                        analysisVersion
                    ]
                );

                for (const evidence of pain.evidence || []) {
                    await client.query(
                        `
                        INSERT INTO "pain_evidence" (
                            "id",
                            "pain_id",
                            "evidence_id",
                            "contribution_type",
                            "created_at"
                        )
                        VALUES ($1, $2, $3, $4, NOW())
                        `,
                        [
                            crypto.randomUUID(),
                            painId,
                            evidence.evidenceId,
                            evidence.contributionType
                        ]
                    );
                }
            }

            const primaryPainId = analysis.primaryPainId
                ? painIds.get(analysis.primaryPainId) || null
                : null;

            if (primaryPainId) {
                await client.query(
                    `
                    UPDATE "pain_analyses"
                    SET "primary_pain_id" = $1,
                        "updated_at" = NOW()
                    WHERE "id" = $2
                    `,
                    [primaryPainId, analysisId]
                );
            }

            // Task correlation + REVIEWED transition: atomic with the Pain
            // persistence above. pain_analysis_id is the actual persisted
            // pain_analyses.id, and the version IDs are the same validated
            // values written to pain_analyses. A failure here rolls back the
            // entire Pain persistence.
            if (taskContext) {
                await client.query(
                    `
                    UPDATE "manual_ai_tasks"
                    SET
                        "pain_analysis_id" = $1,
                        "research_version_id" = $2,
                        "qualification_version_id" = $3,
                        "status" = $4,
                        "updated_at" = NOW()
                    WHERE "id" = $5
                    `,
                    [
                        analysisId,
                        analysis.researchVersionId,
                        analysis.qualificationVersionId,
                        'REVIEWED',
                        taskContext.taskId
                    ]
                );
            }

            analysis.id = analysisId;
            analysis.analysisVersion = analysisVersion;
            analysis.primaryPainId = primaryPainId || undefined;
            analysis.pains = analysis.pains.map(pain => ({
                ...pain,
                id: painIds.get(pain.id) || pain.id,
                analysisId,
                version: analysisVersion
            }));
        });

        console.log(
            `[VERSION_MANAGER] Saved Pain Analysis Version ${analysis.analysisVersion} for lead ${analysis.leadId}`
        );

        return analysis;
    }

    async getVersion(
        leadId: string,
        version: number
    ): Promise<PainAnalysis | null> {
        const analysisResult = await db.query(
            `
            SELECT *
            FROM "pain_analyses"
            WHERE "lead_id" = $1
              AND "analysis_version" = $2
            LIMIT 1
            `,
            [leadId, version]
        );

        const row = analysisResult.rows[0];

        if (!row) {
            return null;
        }

        const painsResult = await db.query(
            `
            SELECT *
            FROM "pains"
            WHERE "analysis_id" = $1
            ORDER BY "created_at" ASC
            `,
            [row.id]
        );

        const pains: Pain[] = [];

        for (const painRow of painsResult.rows) {
            const evidenceResult = await db.query(
                `
                SELECT
                    "evidence_id",
                    "contribution_type"
                FROM "pain_evidence"
                WHERE "pain_id" = $1
                ORDER BY "created_at" ASC
                `,
                [painRow.id]
            );

            pains.push({
                id: painRow.id,
                analysisId: painRow.analysis_id,
                painType: painRow.pain_type,
                title: painRow.title,
                description: painRow.description,
                evidenceType: painRow.evidence_type,
                severity: painRow.severity,
                frequency: painRow.frequency,
                automationRelevance: painRow.automation_relevance,
                confidence: Number(painRow.confidence),
                status: painRow.status,
                priority: painRow.priority,
                reasoning: painRow.reasoning,
                source: painRow.source,
                version: Number(painRow.version),
                evidence: evidenceResult.rows.map((evidence: any) => ({
                    evidenceId: evidence.evidence_id,
                    contributionType: evidence.contribution_type
                }))
            });
        }

        return {
            id: row.id,
            leadId: row.lead_id,
            researchVersionId: row.research_version_id,
            qualificationVersionId: row.qualification_version_id,
            analysisVersion: Number(row.analysis_version),
            status: row.status,
            overallConfidence: Number(row.overall_confidence),
            primaryPainId: pains.find(
                pain => pain.id === row.primary_pain_id
            )?.id,
            pains,
            unresolvedQuestions: [],
            createdAt: new Date(row.created_at)
        };
    }
}

export const painVersionManager = new PainVersionManager();
