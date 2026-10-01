import crypto from 'crypto';
import { db } from '../../lib/db';
import { RequirementsAnalysis, Requirement } from './requirement-types';

export interface RequirementTaskContext {
    taskId: string;
}

export class RequirementVersionManager {
    async saveVersion(
        analysis: RequirementsAnalysis,
        companyId?: string | null,
        taskContext?: RequirementTaskContext
    ): Promise<RequirementsAnalysis> {
        await db.transaction(async (client) => {
            // Task-scoped idempotency (mandatory lock order: taskId -> leadId).
            // Serialize concurrent processing of the same manual AI task, then
            // re-read it inside the transaction so a replay after REVIEWED can
            // never create a second Requirements analysis.
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
                        "pain_analysis_id",
                        "research_version_id",
                        "qualification_version_id",
                        "status"
                    FROM "manual_ai_tasks"
                    WHERE "id" = $1
                    FOR UPDATE
                    `,
                    [taskContext.taskId]
                );

                const task = taskResult.rows[0];

                if (!task) {
                    throw new Error('REQUIREMENTS_TASK_NOT_FOUND');
                }

                if (task.task_type !== 'REQUIREMENTS_EXTRACTION') {
                    throw new Error('REQUIREMENTS_TASK_TYPE_MISMATCH');
                }

                if (task.related_entity_id !== analysis.leadId) {
                    throw new Error('REQUIREMENTS_TASK_LEAD_MISMATCH');
                }

                if (task.status === 'REVIEWED') {
                    throw new Error('REQUIREMENTS_TASK_ALREADY_REVIEWED');
                }

                // Pain identity comes from the persisted task correlation
                // (manual_ai_tasks.pain_analysis_id, stamped at initiation),
                // never from caller-supplied objects.
                const painAnalysisId = task.pain_analysis_id;

                if (!painAnalysisId) {
                    throw new Error('REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND');
                }

                const painAnalysisResult = await client.query(
                    `SELECT "id", "lead_id" FROM "pain_analyses" WHERE "id" = $1`,
                    [painAnalysisId]
                );

                if (!painAnalysisResult.rows[0]) {
                    throw new Error('REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND');
                }

                if (painAnalysisResult.rows[0].lead_id !== analysis.leadId) {
                    throw new Error('REQUIREMENTS_PAIN_ANALYSIS_NOT_FOUND');
                }

                // Persisted Pain identity wins over anything caller-supplied.
                analysis.painAnalysisVersionId = painAnalysisId;

                // Version identity validation: the Research and Qualification
                // versions stamped on the task must exist. These exact IDs are
                // persisted onto requirements_analyses.
                if (!task.research_version_id) {
                    throw new Error('REQUIREMENTS_TASK_VERSION_IDENTITY_MISSING');
                }

                const researchVersionResult = await client.query(
                    `SELECT "id" FROM "research_versions" WHERE "id" = $1`,
                    [task.research_version_id]
                );

                if (!researchVersionResult.rows[0]) {
                    throw new Error('REQUIREMENTS_RESEARCH_VERSION_NOT_FOUND');
                }

                if (!task.qualification_version_id) {
                    throw new Error('REQUIREMENTS_TASK_VERSION_IDENTITY_MISSING');
                }

                const qualificationVersionResult = await client.query(
                    `SELECT "id" FROM "qualifications" WHERE "id" = $1`,
                    [task.qualification_version_id]
                );

                if (!qualificationVersionResult.rows[0]) {
                    throw new Error('REQUIREMENTS_QUALIFICATION_VERSION_NOT_FOUND');
                }

                analysis.researchVersionId = task.research_version_id;
                analysis.qualificationVersionId = task.qualification_version_id;
            }

            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                [analysis.leadId]
            );

            const latestResult = await client.query(
                `
                SELECT "analysis_version"
                FROM "requirements_analyses"
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
                INSERT INTO "requirements_analyses" (
                    "id",
                    "lead_id",
                    "research_version_id",
                    "qualification_version_id",
                    "pain_analysis_version_id",
                    "analysis_version",
                    "status",
                    "overall_completeness",
                    "overall_confidence",
                    "created_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                `,
                [
                    analysisId,
                    analysis.leadId,
                    analysis.researchVersionId || null,
                    analysis.qualificationVersionId || null,
                    analysis.painAnalysisVersionId || null,
                    analysisVersion,
                    analysis.status,
                    analysis.overallCompleteness,
                    analysis.overallConfidence,
                ]
            );

            const savedRequirements: Requirement[] = [];

            for (const requirement of analysis.requirements) {
                const requirementId = crypto.randomUUID();

                await client.query(
                    `
                    INSERT INTO "requirements" (
                        "id",
                        "company_id",
                        "analysis_id",
                        "source_pain_id",
                        "type",
                        "category",
                        "title",
                        "description",
                        "priority",
                        "certainty",
                        "confidence",
                        "status",
                        "trigger_definition",
                        "input_definition",
                        "output_definition",
                        "acceptance_criteria",
                        "business_rule",
                        "data_requirements",
                        "integration_requirements",
                        "human_action_required",
                        "constraints",
                                                "security_requirements",
                        "automation_boundary",
                        "reasoning",
                        "version",
                        "created_at",
                        "updated_at"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        $14,
                        $15,
                        $16,
                        $17,
                        $18,
                        $19,
                        $20,
                        $21,
                        $22,
                        $23,
                        $24,
                        $25,
                        NOW(),
                        NOW()
                    )
                    `,
                    [
                        requirementId,
                        companyId || null,
                        analysisId,
                        requirement.sourcePainId || null,
                        requirement.type,
                        requirement.category || null,
                        requirement.title,
                        requirement.description,
                        requirement.priority,
                        requirement.certainty,
                        requirement.confidence,
                        requirement.status,
                        requirement.triggerDefinition || null,
                        requirement.inputDefinition != null ? JSON.stringify(requirement.inputDefinition) : null,
                        requirement.outputDefinition != null ? JSON.stringify(requirement.outputDefinition) : null,
                        requirement.acceptanceCriteria != null ? JSON.stringify(requirement.acceptanceCriteria) : null,
                        requirement.businessRule || null,
                        requirement.dataRequirements != null ? JSON.stringify(requirement.dataRequirements) : null,
                        requirement.integrationRequirements != null ? JSON.stringify(requirement.integrationRequirements) : null,
                        requirement.humanActionRequired,
                        requirement.constraints || null,
                                                requirement.securityRequirements || null,
                        requirement.automationBoundary,
                        requirement.reasoning,
                        analysisVersion,
                    ]
                );

                savedRequirements.push({
                    ...requirement,
                    id: requirementId,
                    analysisId,
                    version: requirement.version,
                });

                for (const evidence of requirement.evidence || []) {
                    await client.query(
                        `
                        INSERT INTO "requirement_evidence" (
                            "id",
                            "requirement_id",
                            "evidence_id",
                            "contribution_type",
                            "created_at"
                        )
                        VALUES ($1, $2, $3, $4, NOW())
                        `,
                        [
                            crypto.randomUUID(),
                            requirementId,
                            evidence.evidenceId,
                            evidence.contributionType,
                        ]
                    );
                }
            }

            // Task correlation + REVIEWED transition: atomic with the
            // Requirements persistence above. Correlation columns are updated
            // only if they exist on manual_ai_tasks (Migration 037 provides
            // research_version_id / qualification_version_id /
            // pain_analysis_id; no requirements-analysis column exists, which
            // is a documented schema gap — status still transitions).
            if (taskContext) {
                await client.query(
                    `
                    UPDATE "manual_ai_tasks"
                    SET
                        "research_version_id" = $1,
                        "qualification_version_id" = $2,
                        "status" = $3,
                        "updated_at" = NOW()
                    WHERE "id" = $4
                    `,
                    [
                        analysis.researchVersionId || null,
                        analysis.qualificationVersionId || null,
                        'REVIEWED',
                        taskContext.taskId
                    ]
                );
            }

            analysis.id = analysisId;
            analysis.analysisVersion = analysisVersion;
            analysis.requirements = savedRequirements;
        });

        return analysis;
    }

    async getLatestVersion(leadId: string): Promise<RequirementsAnalysis | null> {
        const analysisResult = await db.query(
            `
            SELECT *
            FROM "requirements_analyses"
            WHERE "lead_id" = $1
            ORDER BY "analysis_version" DESC
            LIMIT 1
            `,
            [leadId]
        );

        const row = analysisResult.rows[0];

        if (!row) {
            return null;
        }

        const requirementsResult = await db.query(
            `
            SELECT *
            FROM "requirements"
            WHERE "analysis_id" = $1
            ORDER BY "created_at" ASC
            `,
            [row.id]
        );

        const evidenceResult = await db.query(
            `
            SELECT *
            FROM "requirement_evidence"
            WHERE "requirement_id" = ANY($1::uuid[])
            ORDER BY "created_at" ASC
            `,
            [requirementsResult.rows.map((item: any) => item.id)]
        );

        const evidenceByRequirement = new Map<string, any[]>();

        for (const evidence of evidenceResult.rows) {
            const list = evidenceByRequirement.get(evidence.requirement_id) || [];
            list.push({
                evidenceId: evidence.evidence_id,
                contributionType: evidence.contribution_type,
            });
            evidenceByRequirement.set(evidence.requirement_id, list);
        }

        const requirements: Requirement[] = requirementsResult.rows.map((item: any) => ({
            id: item.id,
            analysisId: item.analysis_id,
            sourcePainId: item.source_pain_id || undefined,
            type: item.type,
            category: item.category || undefined,
            title: item.title,
            description: item.description,
            priority: item.priority,
            certainty: item.certainty,
            confidence: Number(item.confidence),
            status: item.status,
            triggerDefinition: item.trigger_definition || undefined,
            inputDefinition: item.input_definition,
            outputDefinition: item.output_definition,
            acceptanceCriteria: item.acceptance_criteria,
            businessRule: item.business_rule || undefined,
            dataRequirements: item.data_requirements,
            integrationRequirements: item.integration_requirements,
            humanActionRequired: Boolean(item.human_action_required),
            constraints: item.constraints || undefined,
            securityRequirements: item.security_requirements || undefined,
            automationBoundary: item.automation_boundary,
            reasoning: item.reasoning,
            version: Number(item.version),
            evidence: evidenceByRequirement.get(item.id) || [],
        }));

        return {
            id: row.id,
            leadId: row.lead_id,
            researchVersionId: row.research_version_id || '',
            qualificationVersionId: row.qualification_version_id || '',
            painAnalysisVersionId: row.pain_analysis_version_id || '',
            analysisVersion: Number(row.analysis_version),
            status: row.status,
            overallCompleteness: Number(row.overall_completeness || 0),
            overallConfidence: Number(row.overall_confidence || 0),
            requirements,
            unresolvedQuestions: [],
            createdAt: new Date(row.created_at),
        };
    }
}

export const requirementVersionManager = new RequirementVersionManager();
