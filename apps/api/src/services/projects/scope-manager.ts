/**
 * @file scope-manager.ts
 * @description Manages the Scope Baseline, Requirements Confirmation and Change Request governance.
 */

import { db } from '../../lib/db';
import {
    ConfirmationStatus,
    ScopeClassification,
    ScopeBaselineStatus,
    ChangeRequestStatus,
    ChangeRequestType,
    ImpactLevel,
    RequirementsConfirmation,
    RequirementSnapshotItem,
    ScopeBaseline,
    ScopeItem,
    ChangeRequest,
    ImpactAnalysis
} from './scope-types';
import { humanApprovalService } from '../governance/approval-service';
import { ApprovalType, ApprovalDecision } from '../governance/types';
import { auditLogger } from '../../core/logging/audit-logger';
import crypto from 'crypto';

export class ScopeManager {
    /**
     * Creates a requirements confirmation request.
     */
    async createConfirmation(params: {
        projectId: string;
        solutionArchitectureId: string;
        solutionVersionId: string;
        requirementsVersionId: string;
        deliveryPlanVersionId: string;
        userId: string;
    }): Promise<RequirementsConfirmation> {
        const confirmationId = crypto.randomUUID();

        const confirmation = await db.requirements_confirmations.create({
            data: {
                id: confirmationId,
                project_id: params.projectId,
                solution_architecture_id: params.solutionArchitectureId,
                solution_version_id: params.solutionVersionId,
                requirements_version_id: params.requirementsVersionId,
                delivery_plan_version_id: params.deliveryPlanVersionId,
                confirmation_version: 1,
                status: ConfirmationStatus.DRAFT,
                created_by: params.userId,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'REQUIREMENTS_CONFIRMATION_CREATED',
            entityType: 'RequirementsConfirmation',
            entityId: confirmationId,
            details: { projectId: params.projectId }
        });

        return this.mapConfirmationToDomain(confirmation);
    }

    /**
     * Snapshots requirements into the confirmation.
     */
    async snapshotRequirements(
        confirmationId: string,
        userId: string,
        items: {
            requirementId: string;
            classification: ScopeClassification;
            priority: string;
            reason?: string;
        }[]
    ): Promise<void> {
        await db.$transaction(async (tx) => {
            const confirmationResult = await tx.query(
                `SELECT id, status
                 FROM "requirements_confirmations"
                 WHERE id = $1
                 FOR UPDATE`,
                [confirmationId]
            );

            if (confirmationResult.rowCount !== 1) {
                throw new Error('CONFIRMATION_NOT_FOUND');
            }

            const confirmation = confirmationResult.rows[0];

            if (
                confirmation.status !== ConfirmationStatus.DRAFT &&
                confirmation.status !== ConfirmationStatus.PENDING_CONFIRMATION
            ) {
                throw new Error('INVALID_CONFIRMATION_STATUS_FOR_SNAPSHOT');
            }

            await tx.query(
                'DELETE FROM "requirements_confirmation_items" WHERE "confirmation_id" = $1',
                [confirmationId]
            );

            for (const item of items) {
                await tx.query(
                    `INSERT INTO "requirements_confirmation_items"
                    ("id", "confirmation_id", "requirement_id", "classification", "priority", "reason", "created_at")
                    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        crypto.randomUUID(),
                        confirmationId,
                        item.requirementId,
                        item.classification,
                        item.priority,
                        item.reason ?? null,
                        new Date()
                    ]
                );
            }
        });

        await auditLogger.log({
            action: 'REQUIREMENTS_SNAPSHOT_CREATED',
            entityType: 'RequirementsConfirmation',
            entityId: confirmationId,
            details: {
                itemCount: items.length
            }
        });
    }

    /**
     * Confirms the scope baseline.
     */
    async confirmScope(confirmationId: string, userId: string): Promise<ScopeBaseline> {
        const result = await db.$transaction(async (tx) => {
            const confirmationResult = await tx.query(
                `SELECT id, project_id, solution_version_id, delivery_plan_version_id, status
                 FROM "requirements_confirmations"
                 WHERE id = $1
                 FOR UPDATE`,
                [confirmationId]
            );

            if (confirmationResult.rowCount !== 1) {
                throw new Error('CONFIRMATION_NOT_FOUND');
            }

            const confirmation = confirmationResult.rows[0];

            if (confirmation.status === ConfirmationStatus.CONFIRMED) {
                throw new Error('CONFIRMATION_ALREADY_CONFIRMED');
            }

            const itemsResult = await tx.query(
                `SELECT id, requirement_id, classification, priority, reason
                 FROM "requirements_confirmation_items"
                 WHERE confirmation_id = $1`,
                [confirmationId]
            );

            const items = itemsResult.rows;

            if (items.length === 0) {
                throw new Error(
                    'CONFIRMATION_BLOCKED: No requirements captured in snapshot.'
                );
            }

            const unresolved = items.filter(
                item => item.classification === ScopeClassification.UNRESOLVED
            );

            if (unresolved.length > 0) {
                throw new Error(
                    `CONFIRMATION_BLOCKED: ${unresolved.length} unresolved requirements must be clarified.`
                );
            }

            const contentString = JSON.stringify(
                [...items].sort((a, b) =>
                    a.requirement_id.localeCompare(b.requirement_id)
                )
            );
            const contentHash = crypto
                .createHash('sha256')
                .update(contentString)
                .digest('hex');

            const baselineId = crypto.randomUUID();
            const now = new Date();

            const baselineResult = await tx.query(
                `INSERT INTO "scope_baselines"
                    ("id", "project_id", "confirmation_id",
                     "solution_version_id", "delivery_plan_version_id",
                     "version", "status", "created_by",
                     "confirmed_by", "confirmed_at", "content_hash",
                     "created_at")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                         $9, $10, $11, $10)
                 RETURNING *`,
                [
                    baselineId,
                    confirmation.project_id,
                    confirmationId,
                    confirmation.solution_version_id,
                    confirmation.delivery_plan_version_id,
                    1,
                    ScopeBaselineStatus.CONFIRMED,
                    userId,
                    userId,
                    now,
                    contentHash
                ]
            );

            if (baselineResult.rowCount !== 1) {
                throw new Error('SCOPE_BASELINE_CREATION_FAILED');
            }

            for (const item of items) {
                await tx.query(
                    `INSERT INTO "scope_items"
                        ("id", "scope_baseline_id", "source_requirement_id",
                         "classification", "priority", "notes", "created_at")
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        crypto.randomUUID(),
                        baselineId,
                        item.requirement_id,
                        item.classification,
                        item.priority,
                        item.reason,
                        now
                    ]
                );
            }

            const updateResult = await tx.query(
                `UPDATE "requirements_confirmations"
                 SET status = $1,
                     confirmed_by = $2,
                     confirmed_at = $3,
                     updated_at = $3
                 WHERE id = $4
                   AND status <> $1`,
                [
                    ConfirmationStatus.CONFIRMED,
                    userId,
                    now,
                    confirmationId
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('CONFIRMATION_UPDATE_FAILED');
            }

            return {
                baseline: baselineResult.rows[0],
                contentHash
            };
        });

        await auditLogger.log({
            action: 'SCOPE_BASELINE_CONFIRMED',
            entityType: 'ScopeBaseline',
            entityId: result.baseline.id,
            details: { hash: result.contentHash }
        });

        return this.mapBaselineToDomain(result.baseline);
    }
    private async validateConfirmation(confirmationId: string) {
        const items = await db.requirements_confirmation_items.findMany({
            where: { confirmation_id: confirmationId }
        });

        if (items.length === 0) {
            throw new Error('CONFIRMATION_BLOCKED: No requirements captured in snapshot.');
        }

        const unresolved = items.filter(
            i => i.classification === ScopeClassification.UNRESOLVED
        );

        if (unresolved.length > 0) {
            throw new Error(
                `CONFIRMATION_BLOCKED: ${unresolved.length} unresolved requirements must be clarified.`
            );
        }
    }

    private mapConfirmationToDomain(confirmation: any): RequirementsConfirmation {
        return {
            confirmationId: confirmation.id,
            projectId: confirmation.project_id,
            solutionArchitectureId: confirmation.solution_architecture_id,
            solutionVersionId: confirmation.solution_version_id,
            requirementsVersionId: confirmation.requirements_version_id,
            deliveryPlanVersionId: confirmation.delivery_plan_version_id,
            confirmationVersion: confirmation.confirmation_version,
            status: confirmation.status as ConfirmationStatus,
            confirmedBy: confirmation.confirmed_by,
            confirmedAt: confirmation.confirmed_at,
            createdAt: confirmation.created_at,
            updatedAt: confirmation.updated_at
        };
    }

    private mapBaselineToDomain(baseline: any): ScopeBaseline {
        return {
            scopeBaselineId: baseline.id,
            projectId: baseline.project_id,
            confirmationId: baseline.confirmation_id,
            solutionVersionId: baseline.solution_version_id,
            deliveryPlanVersionId: baseline.delivery_plan_version_id,
            version: baseline.version,
            status: baseline.status as ScopeBaselineStatus,
            createdBy: baseline.created_by,
            createdAt: baseline.created_at,
            confirmedBy: baseline.confirmed_by,
            confirmedAt: baseline.confirmed_at,
            supersededAt: baseline.superseded_at,
            contentHash: baseline.content_hash
        };
    }

    /**
     * Manages Change Requests.
     */
    async createChangeRequest(params: {
        projectId: string;
        scopeBaselineId: string;
        requestedBy: string;
        title: string;
        description: string;
        reason: string;
        classification: ChangeRequestType;
    }): Promise<ChangeRequest> {
        const cr = await db.$transaction(async (tx) => {
            const baselineResult = await tx.query(
                `SELECT id, project_id, status
                 FROM "scope_baselines"
                 WHERE id = $1
                 FOR UPDATE`,
                [params.scopeBaselineId]
            );

            if (baselineResult.rowCount !== 1) {
                throw new Error('SCOPE_BASELINE_NOT_FOUND');
            }

            const baseline = baselineResult.rows[0];

            if (baseline.project_id !== params.projectId) {
                throw new Error('SCOPE_BASELINE_PROJECT_MISMATCH');
            }

            if (baseline.status !== ScopeBaselineStatus.CONFIRMED) {
                throw new Error('SCOPE_BASELINE_NOT_CONFIRMED');
            }

            const crId = crypto.randomUUID();
            const now = new Date();

            const result = await tx.query(
                `INSERT INTO "change_requests"
                    ("id", "project_id", "scope_baseline_id", "requested_by",
                     "requested_at", "title", "description", "reason",
                     "classification", "status", "impact_status",
                     "technical_impact", "commercial_impact",
                     "schedule_impact", "risk_level",
                     "created_at", "updated_at")
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8,
                     $9, $10, $11, $12, $13, $14, $15,
                     $16, $17)
                 RETURNING *`,
                [
                    crId,
                    params.projectId,
                    params.scopeBaselineId,
                    params.requestedBy,
                    now,
                    params.title,
                    params.description,
                    params.reason,
                    params.classification,
                    ChangeRequestStatus.SUBMITTED,
                    'PENDING',
                    ImpactLevel.UNKNOWN,
                    ImpactLevel.UNKNOWN,
                    ImpactLevel.UNKNOWN,
                    'UNKNOWN',
                    now,
                    now
                ]
            );

            return result.rows[0];
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_CREATED',
            entityType: 'ChangeRequest',
            entityId: cr.id,
            details: { classification: params.classification }
        });

        return this.mapChangeRequestToDomain(cr);
    }
    async performImpactAnalysis(
        crId: string,
        analystId: string,
        analysis: ImpactAnalysis
    ): Promise<void> {
        await db.$transaction(async (tx) => {
            const crResult = await tx.query(
                `SELECT id, status
                 FROM "change_requests"
                 WHERE id = $1
                 FOR UPDATE`,
                [crId]
            );

            if (crResult.rowCount !== 1) {
                throw new Error('CHANGE_REQUEST_NOT_FOUND');
            }

            const cr = crResult.rows[0];

            const analyzableStatuses = new Set([
                ChangeRequestStatus.SUBMITTED,
                ChangeRequestStatus.UNDER_REVIEW,
                ChangeRequestStatus.IMPACT_ANALYSIS_REQUIRED
            ]);

            if (!analyzableStatuses.has(cr.status as ChangeRequestStatus)) {
                throw new Error('INVALID_CR_STATUS_FOR_IMPACT_ANALYSIS');
            }

            await tx.query(
                `INSERT INTO "change_request_impact_analysis"
                    ("id", "change_request_id", "requirements_impact",
                     "scope_impact", "solution_impact", "workflow_impact",
                     "delivery_plan_impact", "schedule_impact",
                     "commercial_impact", "technical_impact", "risk_impact",
                     "affected_items", "recommendation", "confidence",
                     "analyzed_at", "analyzed_by")
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8,
                     $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                    crypto.randomUUID(),
                    crId,
                    analysis.requirementsImpact,
                    analysis.scopeImpact,
                    analysis.solutionImpact,
                    analysis.workflowImpact,
                    analysis.deliveryPlanImpact,
                    analysis.scheduleImpact,
                    analysis.commercialImpact,
                    analysis.technicalImpact,
                    analysis.riskImpact,
                    analysis.affectedItems,
                    analysis.recommendation,
                    analysis.confidence,
                    new Date(),
                    analystId
                ]
            );

            const updateResult = await tx.query(
                `UPDATE "change_requests"
                 SET impact_status = $1,
                     technical_impact = $2,
                     commercial_impact = $3,
                     schedule_impact = $4,
                     risk_level = $5,
                     status = $6,
                     updated_at = $7
                 WHERE id = $8
                   AND status = $9`,
                [
                    'ANALYZED',
                    analysis.technicalImpact,
                    analysis.commercialImpact,
                    analysis.scheduleImpact,
                    analysis.riskImpact,
                    ChangeRequestStatus.IMPACT_ANALYZED,
                    new Date(),
                    crId,
                    cr.status
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('CHANGE_REQUEST_IMPACT_UPDATE_FAILED');
            }
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_ANALYZED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: { risk: analysis.riskImpact }
        });
    }
    async requestChangeRequestApproval(
        crId: string,
        userId: string
    ): Promise<string> {
        const approvalId = await db.$transaction(async (tx) => {
            const result = await tx.query(
                `SELECT id, status
                 FROM "change_requests"
                 WHERE id = $1
                 FOR UPDATE`,
                [crId]
            );

            if (result.rowCount !== 1) {
                throw new Error('CHANGE_REQUEST_NOT_FOUND');
            }

            const cr = result.rows[0];

            if (cr.status === ChangeRequestStatus.PENDING_APPROVAL) {
                throw new Error('CHANGE_REQUEST_APPROVAL_ALREADY_PENDING');
            }

            if (
                cr.status !== ChangeRequestStatus.SUBMITTED &&
                cr.status !== ChangeRequestStatus.IMPACT_ANALYZED
            ) {
                throw new Error('INVALID_CR_STATUS_FOR_APPROVAL');
            }

            const approvalId =
                await humanApprovalService.requestApprovalWithClient(tx, {
                    entityId: crId,
                    entityType: 'ChangeRequest',
                    approvalType: ApprovalType.CHANGE_REQUEST,
                    requestedBy: userId
                });

            await tx.query(
                `UPDATE "change_requests"
                 SET status = $1,
                     updated_at = $2
                 WHERE id = $3`,
                [
                    ChangeRequestStatus.PENDING_APPROVAL,
                    new Date(),
                    crId
                ]
            );

            return approvalId;
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: {
                requestedBy: userId,
                approvalId
            }
        });

        return approvalId;
    }

    async approveChangeRequest(
        crId: string,
        userId: string,
        reason: string
    ): Promise<void> {
        const auditData = await db.$transaction(async (tx) => {
            const result = await tx.query(
                `SELECT id, status
                 FROM "change_requests"
                 WHERE id = $1
                 FOR UPDATE`,
                [crId]
            );

            if (result.rowCount !== 1) {
                throw new Error('CHANGE_REQUEST_NOT_FOUND');
            }

            const cr = result.rows[0];

            if (cr.status !== ChangeRequestStatus.PENDING_APPROVAL) {
                throw new Error('INVALID_CR_STATUS_FOR_APPROVAL');
            }

            const approval =
                await humanApprovalService.getActiveApprovalWithClient(
                    tx,
                    crId,
                    ApprovalType.CHANGE_REQUEST
                );

            if (
                !approval ||
                approval.decision !== ApprovalDecision.APPROVED
            ) {
                throw new Error('CHANGE_REQUEST_APPROVAL_REQUIRED');
            }

            const updateResult = await tx.query(
                `UPDATE "change_requests"
                 SET status = $1,
                     approved_by = $2,
                     approved_at = $3,
                     decision_reason = $4,
                     updated_at = $5
                 WHERE id = $6
                   AND status = $7`,
                [
                    ChangeRequestStatus.APPROVED,
                    approval.decidedBy || userId,
                    approval.decidedAt || new Date(),
                    reason,
                    new Date(),
                    crId,
                    ChangeRequestStatus.PENDING_APPROVAL
                ]
            );

            if (updateResult.rowCount !== 1) {
                throw new Error('CHANGE_REQUEST_APPROVAL_STATE_CONFLICT');
            }

            return {
                approvedBy: approval.decidedBy || userId,
                approvalId: approval.approvalId
            };
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_APPROVED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: auditData
        });
    }
    private mapChangeRequestToDomain(cr: any): ChangeRequest {
        return {
            changeRequestId: cr.id,
            projectId: cr.project_id,
            scopeBaselineId: cr.scope_baseline_id,
            requestedBy: cr.requested_by,
            requestedAt: cr.requested_at,
            title: cr.title,
            description: cr.description,
            reason: cr.reason,
            classification: cr.classification as ChangeRequestType,
            impactStatus: cr.impact_status,
            technicalImpact: cr.technical_impact as ImpactLevel,
            commercialImpact: cr.commercial_impact as ImpactLevel,
            scheduleImpact: cr.schedule_impact as ImpactLevel,
            riskLevel: cr.risk_level,
            status: cr.status as ChangeRequestStatus,
            approvedBy: cr.approved_by,
            approvedAt: cr.approved_at,
            rejectedBy: cr.rejected_by,
            rejectedAt: cr.rejected_at,
            decisionReason: cr.decision_reason,
            createdAt: cr.created_at,
            updatedAt: cr.updated_at
        };
    }
}

export const scopeManager = new ScopeManager();
