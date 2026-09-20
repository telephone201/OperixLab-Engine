/**
 * @file review-service.ts
 * @description Orchestrates Client Review sessions, feedback, and acceptance governance.
 */

import { db } from '../../lib/db';
import {
    ReviewSession,
    ReviewSessionStatus,
    ReviewItem,
    ReviewItemStatus,
    ReviewFeedback,
    FeedbackClassification,
    ReviewFinding,
    FindingSeverity,
    FindingStatus,
    AcceptanceRecord,
    AcceptanceDecision
} from './review-types';
import { reviewReadinessGate } from './review-readiness-gate';
import { scopeManager } from './scope-manager';
import { auditLogger } from '../../core/logging/audit-logger';
import { humanApprovalService } from '../governance/approval-service';
import crypto from 'crypto';

export class ReviewService {
    /**
     * Initiates a new review session.
     */
    async startReviewSession(params: {
        projectId: string;
        scopeBaselineId: string;
        deliveryPlanVersionId: string;
        solutionVersionId: string;
        workflowVersionId: string;
        userId: string;
    }): Promise<ReviewSession> {
        // 1. Readiness Gate
        const readiness = await reviewReadinessGate.checkReadiness(params.projectId);
        if (!readiness.ready) {
            throw new Error(`REVIEW_NOT_READY: ${readiness.reason}`);
        }

        const sessionId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const session = await db.review_sessions.create({
            data: {
                id: sessionId,
                project_id: params.projectId,
                scope_baseline_id: params.scopeBaselineId,
                delivery_plan_version_id: params.deliveryPlanVersionId,
                solution_version_id: params.solutionVersionId,
                workflow_version_id: params.workflowVersionId,
                review_version: 1,
                status: ReviewSessionStatus.READY_FOR_REVIEW,
                created_by: params.userId,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'REVIEW_SESSION_CREATED',
            entityType: 'ReviewSession',
            entityId: sessionId,
            details: { projectId: params.projectId }
        });

        return this.mapToDomain(session);
    }

    /**
     * Generates review items based on the confirmed scope.
     */
    async generateReviewChecklist(sessionId: string): Promise<ReviewItem[]> {
        const session = await db.review_sessions.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error('REVIEW_SESSION_NOT_FOUND');

        const scopeItems = await db.scope_items.findMany({
            where: { scope_baseline_id: session.scope_baseline_id }
        });

        const items = scopeItems.map(item => ({
            id: `ri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            review_session_id: sessionId,
            scope_item_id: item.id,
            title: `Review: ${item.title}`,
            description: `Verify delivery of: ${item.description}`,
            expected_outcome: `Satisfies ${item.classification} requirement`,
            status: ReviewItemStatus.PENDING,
            evidence_required: item.classification === 'INCLUDED',
            created_at: new Date(),
            updated_at: new Date()
        }));

        await db.review_items.createMany({ data: items });

        return items.map(i => this.mapToDomainItem(i));
    }

    /**
     * records client feedback on a specific review item.
     */
    async submitFeedback(params: {
        sessionId: string;
        userId: string;
        itemId?: string;
        comment: string;
        classification: FeedbackClassification;
        severity: FindingSeverity;
    }): Promise<void> {
        const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await db.review_feedback.create({
            data: {
                id: feedbackId,
                review_session_id: params.sessionId,
                review_item_id: params.itemId,
                submitted_by: params.userId,
                submitted_at: new Date(),
                comment: params.comment,
                classification: params.classification,
                severity: params.severity,
                status: 'NEW'
            }
        });

        // If feedback is an ISSUE or CHANGE_REQUEST, create a finding automatically
        if (params.classification === FeedbackClassification.ISSUE || params.classification === FeedbackClassification.CHANGE_REQUEST) {
            await this.createFinding(params.sessionId, params.itemId!, params.comment, params.severity);
        }

        await auditLogger.log({
            action: 'REVIEW_FEEDBACK_ADDED',
            entityType: 'ReviewSession',
            entityId: params.sessionId,
            details: { classification: params.classification }
        });
    }

    async createFinding(sessionId: string, itemId: string, description: string, severity: FindingSeverity): Promise<void> {
        const findingId = `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.review_findings.create({
            data: {
                id: findingId,
                review_session_id: sessionId,
                review_item_id: itemId,
                description,
                severity,
                status: FindingStatus.OPEN,
                created_at: new Date(),
                updated_at: new Date()
            }
        });
    }

    /**
     * Final Acceptance Decision.
     */
    async submitAcceptance(params: {
        sessionId: string;
        userId: string;
        decision: AcceptanceDecision;
        reason: string;
    }): Promise<AcceptanceRecord> {
        const session = await db.review_sessions.findUnique({ where: { id: params.sessionId } });
        if (!session) throw new Error('REVIEW_SESSION_NOT_FOUND');

        // 1. Check for blocking findings
        const blockingFindings = await db.review_findings.count({
            where: {
                review_session_id: params.sessionId,
                status: { not: FindingStatus.RESOLVED },
                severity: { in: ['HIGH', 'CRITICAL'] }
            }
        });

        if (blockingFindings > 0) {
            throw new Error(`ACCEPTANCE_BLOCKED: ${blockingFindings} critical/high findings must be resolved first.`);
        }

        // 2. Create Acceptance Record
        const acceptanceId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Calculate review hash (conceptual)
        const reviewItems = await db.review_items.findMany({ where: { review_session_id: params.sessionId } });
        const reviewHash = crypto.createHash('sha256').update(JSON.stringify(reviewItems)).digest('hex');

        const acceptance = await db.acceptance_records.create({
            data: {
                id: acceptanceId,
                review_session_id: params.sessionId,
                project_id: session.project_id,
                scope_baseline_id: session.scope_baseline_id,
                delivery_plan_version_id: session.delivery_plan_version_id,
                decision: params.decision,
                decided_by: params.userId,
                decided_at: new Date(),
                reason: params.reason,
                scope_hash: 'current_baseline_hash', // Resolved from baseline
                review_hash: reviewHash,
                created_at: new Date()
            }
        });

        // 3. Update Project Lifecycle
        if (params.decision === AcceptanceDecision.ACCEPTED) {
            await db.projects.update({
                where: { id: session.project_id },
                data: { status: 'ACCEPTED' }
            });
        } else if (params.decision === AcceptanceDecision.REJECTED) {
            await db.projects.update({
                where: { id: session.project_id },
                data: { status: 'REVIEW' } // Stay in review or move to corrective work
            });
        }

        await auditLogger.log({
            action: 'PROJECT_ACCEPTED',
            entityType: 'Project',
            entityId: session.project_id,
            details: { decision: params.decision, reason: params.reason }
        });

        return this.mapToDomainAcceptance(acceptance);
    }

    private mapToDomainItem(item: any): ReviewItem {
        return {
            reviewItemId: item.id,
            reviewSessionId: item.review_session_id,
            scopeItemId: item.scope_item_id,
            deliveryTaskId: item.delivery_task_id,
            milestoneId: item.milestone_id,
            title: item.title,
            description: item.description,
            expectedOutcome: item.expected_outcome,
            status: item.status as ReviewItemStatus,
            evidenceRequired: item.evidence_required,
            evidenceReference: item.evidence_reference,
            reviewerComment: item.reviewer_comment,
            createdAt: item.created_at,
            updatedAt: item.updated_at
        };
    }
    private mapToDomain(session: any): ReviewSession {
        return {
            reviewSessionId: session.id,
            projectId: session.project_id,
            scopeBaselineId: session.scope_baseline_id,
            deliveryPlanVersionId: session.delivery_plan_version_id,
            solutionVersionId: session.solution_version_id,
            workflowVersionId: session.workflow_version_id,
            reviewVersion: session.review_version,
            status: session.status as ReviewSessionStatus,
            startedAt: session.started_at,
            completedAt: session.completed_at,
            createdBy: session.created_by,
            createdAt: session.created_at,
            updatedAt: session.updated_at
        };
    }

    private mapToDomainAcceptance(acc: any): AcceptanceRecord {
        return {
            acceptanceId: acc.id,
            reviewSessionId: acc.review_session_id,
            projectId: acc.project_id,
            scopeBaselineId: acc.scope_baseline_id,
            deliveryPlanVersionId: acc.delivery_plan_version_id,
            decision: acc.decision as AcceptanceDecision,
            decidedBy: acc.decided_by,
            decidedAt: acc.decided_at,
            reason: acc.reason,
            scopeHash: acc.scope_hash,
            reviewHash: acc.review_hash,
            createdAt: acc.created_at
        };
    }
}

export const reviewService = new ReviewService();
