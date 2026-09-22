/**
 * @file completion-service.ts
 * @description Orchestrates the project closure process, ensuring all delivery and governance gates are passed.
 */

import { db } from '../../lib/db';
import {
    CompletionStatus,
    CompletionReviewStatus,
    CompletionDecision,
    CompletionItemStatus,
    CompletionReadiness,
    CompletionReview,
    ProjectClosureSnapshot
} from './completion-types';
import { completionEligibilityGate } from './completion-eligibility-gate';
import { ProjectStatus } from './types';
import { auditLogger } from '../../core/logging/audit-logger';
import crypto from 'crypto';

export class CompletionService {
    /**
     * Evaluates if a project is ready for closure and creates a readiness record.
     */
    async evaluateCompletionReadiness(projectId: string, userId: string): Promise<CompletionReadiness> {
        const evaluation = await completionEligibilityGate.evaluate(projectId);

        const readinessId = crypto.randomUUID();

        // Fetch references for the snapshot
        const project = await db.projects.findUnique({ where: { id: projectId } });
        const acceptance = await db.acceptance_records.findFirst({ where: { project_id: projectId }, orderBy: { created_at: 'desc' } });
        const handover = await db.handovers.findFirst({ where: { project_id: projectId }, orderBy: { completed_at: 'desc' } });
        const plan = await db.delivery_plans.findFirst({ where: { project_id: projectId }, orderBy: { plan_version: 'desc' } });

        const readiness = await db.completion_readiness.create({
            data: {
                id: readinessId,
                project_id: projectId,
                handover_id: handover?.id,
                acceptance_id: acceptance?.id,
                scope_version_id: acceptance?.scope_baseline_id,
                delivery_plan_version_id: plan?.id,
                status: evaluation.status,
                evaluated_at: new Date(),
                evaluated_by: userId,
                rules_version: 'v1.0',
                blocking_reasons: evaluation.blockingReasons,
                warnings: evaluation.warnings,
                created_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'COMPLETION_READINESS_EVALUATED',
            entityType: 'CompletionReadiness',
            entityId: readinessId,
            details: { status: evaluation.status, blockingCount: evaluation.blockingReasons.length }
        });

        return this.mapReadinessToDomain(readiness);
    }

    /**
     * Initiates a formal completion review.
     */
    async startCompletionReview(projectId: string, readinessId: string, userId: string): Promise<CompletionReview> {
        const result = await db.transaction(async (tx) => {
            const projectResult = await tx.query(
                `SELECT id
                 FROM projects
                 WHERE id = $1
                 FOR UPDATE`,
                [projectId]
            );

            if (projectResult.rowCount !== 1) {
                throw new Error('PROJECT_NOT_FOUND');
            }

            const readinessResult = await tx.query(
                `SELECT id, project_id, status
                 FROM completion_readiness
                 WHERE id = $1
                 FOR UPDATE`,
                [readinessId]
            );

            if (readinessResult.rowCount !== 1) {
                throw new Error('COMPLETION_READINESS_NOT_FOUND');
            }

            const readiness = readinessResult.rows[0];

            if (readiness.project_id !== projectId) {
                throw new Error('COMPLETION_READINESS_PROJECT_MISMATCH');
            }

            if (readiness.status !== CompletionStatus.READY) {
                throw new Error(
                    'COMPLETION_NOT_READY: Project must be in READY status for completion review.'
                );
            }

            const versionResult = await tx.query(
                `SELECT COALESCE(MAX(completion_version), 0) + 1 AS next_version
                 FROM completion_reviews
                 WHERE project_id = $1`,
                [projectId]
            );

            const completionVersion = Number(versionResult.rows[0].next_version);
            const reviewId = crypto.randomUUID();
            const now = new Date();

            const reviewResult = await tx.query(
                `INSERT INTO completion_reviews
                    (id, project_id, completion_readiness_id, completion_version,
                     status, reviewed_by, reviewed_at, decision, reason, created_at)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    reviewId,
                    projectId,
                    readinessId,
                    completionVersion,
                    CompletionReviewStatus.READY,
                    userId,
                    now,
                    CompletionDecision.PENDING,
                    'Review initiated',
                    now
                ]
            );

            if (reviewResult.rowCount !== 1) {
                throw new Error('COMPLETION_REVIEW_CREATE_FAILED');
            }

            return reviewResult.rows[0];
        });

        await auditLogger.log({
            action: 'COMPLETION_REVIEW_CREATED',
            entityType: 'CompletionReview',
            entityId: result.id,
            details: {
                projectId,
                completionVersion: result.completion_version
            }
        });

        return this.mapToDomain(result);
    }

    /**
     * Finalizes project completion.
     * This is the atomic operation that closes the project.
     */
    async finalizeCompletion(reviewId: string, userId: string): Promise<{ projectId: string, snapshotId: string }> {
        const initialReview = await db.completion_reviews.findUnique({
            where: { id: reviewId }
        });

        if (!initialReview) {
            throw new Error('COMPLETION_REVIEW_NOT_FOUND');
        }

        const result = await db.transaction(async (tx) => {
            const projectResult = await tx.query(
                `SELECT id, status
                 FROM projects
                 WHERE id = $1
                 FOR UPDATE`,
                [initialReview.project_id]
            );

            if (projectResult.rowCount !== 1) {
                throw new Error('PROJECT_NOT_FOUND');
            }

            const project = projectResult.rows[0];

            if (project.status !== ProjectStatus.HANDED_OVER) {
                if (project.status === ProjectStatus.COMPLETED) {
                    throw new Error('PROJECT_ALREADY_COMPLETED');
                }

                throw new Error(
                    `PROJECT_STATE_CONFLICT: Project must be HANDED_OVER before completion. Current state is ${project.status}`
                );
            }

            const reviewResult = await tx.query(
                `SELECT id, project_id, completion_version, decision
                 FROM completion_reviews
                 WHERE id = $1
                 FOR UPDATE`,
                [reviewId]
            );

            if (reviewResult.rowCount !== 1) {
                throw new Error('COMPLETION_REVIEW_NOT_FOUND');
            }

            const review = reviewResult.rows[0];

            if (review.project_id !== project.id) {
                throw new Error('COMPLETION_REVIEW_PROJECT_MISMATCH');
            }

            if (review.decision !== CompletionDecision.APPROVED) {
                throw new Error(
                    'COMPLETION_NOT_APPROVED: Only approved reviews can finalize a project.'
                );
            }

            const finalCheck = await completionEligibilityGate.evaluateWithClient(
                project.id,
                tx
            );

            if (!finalCheck.ready) {
                throw new Error(
                    `FINAL_INTEGRITY_CHECK_FAILED: ${finalCheck.blockingReasons.join(', ')}`
                );
            }

            const acceptanceResult = await tx.query(
                `SELECT id, scope_baseline_id
                 FROM acceptance_records
                 WHERE project_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [project.id]
            );

            const handoverResult = await tx.query(
                `SELECT id, scope_baseline_id, delivery_plan_version_id,
                        solution_version_id, workflow_version_id
                 FROM handovers
                 WHERE project_id = $1
                   AND status = 'HANDED_OVER'
                 ORDER BY completed_at DESC NULLS LAST, created_at DESC
                 LIMIT 1`,
                [project.id]
            );

            const planResult = await tx.query(
                `SELECT id
                 FROM delivery_plans
                 WHERE project_id = $1
                 ORDER BY plan_version DESC
                 LIMIT 1`,
                [project.id]
            );

            const acceptance = acceptanceResult.rows[0];
            const handover = handoverResult.rows[0];
            const plan = planResult.rows[0];

            if (!handover) {
                throw new Error('HANDOVER_MISSING_OR_INCOMPLETE');
            }

            const supportResult = await tx.query(
                `SELECT id
                 FROM support_transitions
                 WHERE project_id = $1
                   AND handover_id = $2
                   AND status = 'COMPLETED'
                 ORDER BY transitioned_at DESC
                 LIMIT 1`,
                [project.id, handover.id]
            );

            const support = supportResult.rows[0];

            if (!support) {
                throw new Error('SUPPORT_TRANSITION_MISSING');
            }

            const snapshotId = crypto.randomUUID();
            const completionDate = new Date();

            const snapshotContent = JSON.stringify({
                projectId: project.id,
                acceptanceId: acceptance?.id ?? null,
                scopeVersionId: handover.scope_baseline_id ?? acceptance?.scope_baseline_id ?? null,
                deliveryPlanVersionId: handover.delivery_plan_version_id ?? plan?.id ?? null,
                solutionVersionId: handover.solution_version_id ?? null,
                workflowVersionId: handover.workflow_version_id ?? null,
                handoverId: handover.id,
                supportTransitionId: support.id,
                completionReviewId: review.id,
                completionVersion: review.completion_version,
                status: ProjectStatus.COMPLETED
            });

            const closureHash = crypto
                .createHash('sha256')
                .update(snapshotContent)
                .digest('hex');

            const snapshotResult = await tx.query(
                `INSERT INTO project_closure_snapshots
                    (id, project_id, acceptance_id, scope_version_id,
                     delivery_plan_version_id, solution_version_id,
                     workflow_version_id, handover_id, support_transition_id,
                     completion_review_id, completion_version,
                     completion_date, closure_hash, created_at)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                     $11, $12, $13, $14)
                 RETURNING id`,
                [
                    snapshotId,
                    project.id,
                    acceptance?.id ?? null,
                    handover.scope_baseline_id ?? acceptance?.scope_baseline_id ?? null,
                    handover.delivery_plan_version_id ?? plan?.id ?? null,
                    handover.solution_version_id ?? null,
                    handover.workflow_version_id ?? null,
                    handover.id,
                    support.id,
                    review.id,
                    review.completion_version,
                    completionDate,
                    closureHash,
                    completionDate
                ]
            );

            if (snapshotResult.rowCount !== 1) {
                throw new Error('COMPLETION_SNAPSHOT_FAILED');
            }

            const projectUpdate = await tx.query(
                `UPDATE projects
                 SET status = $1
                 WHERE id = $2
                   AND status = $3
                 RETURNING id`,
                [
                    ProjectStatus.COMPLETED,
                    project.id,
                    ProjectStatus.HANDED_OVER
                ]
            );

            if (projectUpdate.rowCount !== 1) {
                throw new Error(
                    'PROJECT_STATE_CONFLICT: Project state changed before completion.'
                );
            }

            return {
                projectId: project.id,
                snapshotId,
                completionReviewId: review.id
            };
        });

        await auditLogger.log({
            action: 'PROJECT_COMPLETED',
            entityType: 'Project',
            entityId: result.projectId,
            details: {
                completionReviewId: result.completionReviewId,
                snapshotId: result.snapshotId,
                completedBy: userId
            }
        });

        return {
            projectId: result.projectId,
            snapshotId: result.snapshotId
        };
    }
    private mapReadinessToDomain(readiness: any): CompletionReadiness {
        return {
            completionReadinessId: readiness.id,
            projectId: readiness.project_id,
            handoverId: readiness.handover_id,
            acceptanceId: readiness.acceptance_id,
            scopeVersionId: readiness.scope_version_id,
            deliveryPlanVersionId: readiness.delivery_plan_version_id,
            status: readiness.status as CompletionStatus,
            evaluatedAt: readiness.evaluated_at,
            evaluatedBy: readiness.evaluated_by,
            rulesVersion: readiness.rules_version,
            blockingReasons: readiness.blocking_reasons ?? [],
            warnings: readiness.warnings ?? [],
            createdAt: readiness.created_at,
            evidenceReferences: readiness.evidence_references ?? []
        };
    }
    private mapToDomain(review: any): CompletionReview {
        return {
            completionReviewId: review.id,
            projectId: review.project_id,
            completionReadinessId: review.completion_readiness_id,
            completionVersion: review.completion_version,
            status: review.status as CompletionReviewStatus,
            reviewedBy: review.reviewed_by,
            reviewedAt: review.reviewed_at,
            decision: review.decision as CompletionDecision,
            reason: review.reason,
            evidenceSnapshot: review.evidence_snapshot,
            createdAt: review.created_at
        };
    }
}

export const completionService = new CompletionService();

