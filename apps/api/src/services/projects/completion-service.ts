/**
 * @file completion-service.ts
 * @description Orchestrates the project closure process, ensuring all delivery and governance gates are passed.
 */

import { db } from '../lib/db';
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

        const readinessId = `cr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

        return this.mapToDomain(readiness);
    }

    /**
     * Initiates a formal completion review.
     */
    async startCompletionReview(projectId: string, readinessId: string, userId: string): Promise<CompletionReview> {
        const readiness = await db.completion_readiness.findUnique({ where: { id: readinessId } });
        if (!readiness || readiness.status !== CompletionStatus.READY) {
            throw new Error('COMPLETION_NOT_READY: Project must be in READY status for completion review.');
        }

        const reviewId = `crev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const review = await db.completion_reviews.create({
            data: {
                id: reviewId,
                project_id: projectId,
                completion_readiness_id: readinessId,
                completion_version: 1,
                status: CompletionReviewStatus.READY,
                reviewed_by: userId,
                reviewed_at: new Date(),
                decision: CompletionDecision.PENDING,
                reason: 'Review initiated',
                created_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'COMPLETION_REVIEW_CREATED',
            entityType: 'CompletionReview',
            entityId: reviewId,
            details: { projectId }
        });

        return this.mapToDomain(review);
    }

    /**
     * Finalizes project completion.
     * This is the atomic operation that closes the project.
     */
    async finalizeCompletion(reviewId: string, userId: string): Promise<{ projectId: string, snapshotId: string }> {
        const review = await db.completion_reviews.findUnique({ where: { id: reviewId } });
        if (!review) throw new Error('COMPLETION_REVIEW_NOT_FOUND');
        if (review.decision !== CompletionDecision.APPROVED) {
            throw new Error('COMPLETION_NOT_APPROVED: Only approved reviews can finalize a project.');
        }

        const project = await db.projects.findUnique({ where: { id: review.project_id } });
        if (!project) throw new Error('PROJECT_NOT_FOUND');

        // Final Integrity Check (SOP Rule 22)
        const finalCheck = await completionEligibilityGate.evaluate(project.id);
        if (!finalCheck.ready) {
            throw new Error(`FINAL_INTEGRITY_CHECK_FAILED: ${finalCheck.blockingReasons.join(', ')}`);
        }

        // Transactional Closure
        return await db.$transaction(async (tx) => {
            // 1. Create Closure Snapshot
            const snapshotId = `snap_close_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Gather final references for snapshot
            const acceptance = await tx.acceptance_records.findFirst({ where: { project_id: project.id }, orderBy: { created_at: 'desc' } });
            const handover = await tx.handovers.findFirst({ where: { project_id: project.id }, orderBy: { completed_at: 'desc' } });
            const plan = await tx.delivery_plans.findFirst({ where: { project_id: project.id }, orderBy: { plan_version: 'desc' } });

            const snapshotContent = JSON.stringify({
                acceptanceId: acceptance?.id,
                handoverId: handover?.id,
                planId: plan?.id,
                status: 'COMPLETED'
            });
            const closureHash = crypto.createHash('sha256').update(snapshotContent).digest('hex');

            await tx.project_closure_snapshots.create({
                data: {
                    id: snapshotId,
                    project_id: project.id,
                    acceptance_id: acceptance?.id,
                    scope_version_id: acceptance?.scope_baseline_id,
                    delivery_plan_version_id: plan?.id,
                    completion_review_id: review.id,
                    completion_version: review.completion_version,
                    completion_date: new Date(),
                    closure_hash: closureHash,
                    created_at: new Date()
                }
            });

            // 2. Transition Project to COMPLETED
            await tx.projects.update({
                where: { id: project.id },
                data: { status: ProjectStatus.COMPLETED }
            });

            // 3. Audit Event
            await auditLogger.log({
                action: 'PROJECT_COMPLETED',
                entityType: 'Project',
                entityId: project.id,
                details: { completionReviewId: review.id, snapshotId: snapshotId }
            });

            return { projectId: project.id, snapshotId };
        });
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
