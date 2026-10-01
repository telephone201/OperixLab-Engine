/**
 * @file qualification-version-manager.ts
 * @description Manages persistence and versioning of qualification results.
 */

import crypto from 'crypto';
import { db } from '../../lib/db';
import { QualificationResult, ScoreComponent } from './qualification-types';

export class QualificationVersionManager {
    /**
     * Persists a qualification result as a new immutable version.
     *
     * A per-lead PostgreSQL advisory lock prevents concurrent qualification
     * calculations from receiving the same version number.
     */
    async saveResult(result: QualificationResult): Promise<void> {
        await db.transaction(async (client) => {
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1))`,
                [result.leadId]
            );

            const latestResult = await client.query(
                `
                SELECT "version"
                FROM "qualifications"
                WHERE "lead_id" = $1
                ORDER BY "version" DESC
                LIMIT 1
                `,
                [result.leadId]
            );

            const latestVersion = latestResult.rows[0]
                ? Number(latestResult.rows[0].version)
                : 0;

            const version = latestVersion + 1;
            const qualificationId = crypto.randomUUID();

            await client.query(
                `
                INSERT INTO "qualifications" (
                    "id",
                    "lead_id",
                    "total_score",
                    "max_score",
                    "threshold",
                    "qualified",
                    "label",
                    "version",
                    "calculated_at",
                    "updated_at"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                `,
                [
                    qualificationId,
                    result.leadId,
                    result.totalScore,
                    result.maxScore,
                    result.threshold,
                    result.qualified,
                    result.label,
                    version,
                    result.calculatedAt
                ]
            );

            for (const component of result.components) {
                await client.query(
                    `
                    INSERT INTO "score_components" (
                        "id",
                        "qualification_id",
                        "component_name",
                        "raw_value",
                        "score",
                        "max_score",
                        "confidence",
                        "reasoning",
                        "source_evidence_ids",
                        "is_overridden",
                        "override_score",
                        "override_reason",
                        "created_at",
                        "updated_at"
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9, $10, $11, $12, NOW(), NOW()
                    )
                    `,
                    [
                        crypto.randomUUID(),
                        qualificationId,
                        component.componentName,
                        component.raw_value,
                        component.score,
                        component.max_score,
                        component.confidence,
                        component.reasoning,
                        component.evidence_ids,
                        component.is_overridden,
                        component.override_score ?? null,
                        component.override_reason ?? null
                    ]
                );
            }
        });

        console.log(
            `[VERSION_MANAGER] Saved qualification for lead ${result.leadId}`
        );
    }

    async getLatestResult(leadId: string): Promise<QualificationResult | null> {
        const qualification = await db.query(
            `
            SELECT *
            FROM "qualifications"
            WHERE "lead_id" = $1
            ORDER BY "version" DESC
            LIMIT 1
            `,
            [leadId]
        );

        const row = qualification.rows[0];

        if (!row) {
            return null;
        }

        const componentsResult = await db.query(
            `
            SELECT *
            FROM "score_components"
            WHERE "qualification_id" = $1
            ORDER BY "created_at" ASC
            `,
            [row.id]
        );

        const components: ScoreComponent[] = componentsResult.rows.map(
            (component: any) => ({
                componentName: component.component_name,
                raw_value: component.raw_value,
                score: Number(component.score),
                max_score: Number(component.max_score),
                confidence: Number(component.confidence),
                reasoning: component.reasoning,
                evidence_ids: component.source_evidence_ids || [],
                is_overridden: Boolean(component.is_overridden),
                ...(component.override_score !== null &&
                component.override_score !== undefined
                    ? { override_score: Number(component.override_score) }
                    : {}),
                ...(component.override_reason !== null &&
                component.override_reason !== undefined
                    ? { override_reason: component.override_reason }
                    : {})
            })
        );

        return {
            leadId: row.lead_id,
            totalScore: Number(row.total_score),
            maxScore: Number(row.max_score),
            threshold: Number(row.threshold),
            qualified: Boolean(row.qualified),
            label: row.label,
            components,
            version: Number(row.version),
            calculatedAt: new Date(row.calculated_at)
        };
    }
}
