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
        const confirmationId = `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
        const confirmation = await db.requirements_confirmations.findUnique({
            where: { id: confirmationId }
        });

        if (!confirmation) {
            throw new Error('CONFIRMATION_NOT_FOUND');
        }

        // The custom db transaction API accepts a callback, not an array.
        await db.$transaction(async (tx) => {
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
                        `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            details: { itemCount: items.length }
        });
    }

    /**
     * Confirms the scope baseline.
     */
    async confirmScope(confirmationId: string, userId: string): Promise<ScopeBaseline> {
        const confirmation = await db.requirements_confirmations.findUnique({
            where: { id: confirmationId }
        });

        if (!confirmation) {
            throw new Error('CONFIRMATION_NOT_FOUND');
        }

        // 1. Validation
        await this.validateConfirmation(confirmationId);

        // 2. Create Immutable Scope Baseline
        const baselineId = `base_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const items = await db.requirements_confirmation_items.findMany({
            where: { confirmation_id: confirmationId }
        });

        // Generate Hash for the baseline
        const contentString = JSON.stringify(
            items.sort((a, b) => a.requirement_id.localeCompare(b.requirement_id))
        );
        const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');

        const baseline = await db.scope_baselines.create({
            data: {
                id: baselineId,
                project_id: confirmation.project_id,
                confirmation_id: confirmationId,
                solution_version_id: confirmation.solution_version_id,
                delivery_plan_version_id: confirmation.delivery_plan_version_id,
                version: 1,
                status: ScopeBaselineStatus.CONFIRMED,
                created_by: userId,
                confirmed_by: userId,
                confirmed_at: new Date(),
                content_hash: contentHash,
                created_at: new Date()
            }
        });

        // 3. Create Scope Items from Snapshot
        await db.scope_items.createMany({
            data: items.map(item => ({
                id: `si_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                scope_baseline_id: baselineId,
                source_requirement_id: item.requirement_id,
                classification: item.classification,
                priority: item.priority,
                notes: item.reason
            }))
        });

        // 4. Update Confirmation Status
        await db.requirements_confirmations.update({
            where: { id: confirmationId },
            data: {
                status: ConfirmationStatus.CONFIRMED,
                confirmed_by: userId,
                confirmed_at: new Date()
            }
        });

        await auditLogger.log({
            action: 'SCOPE_BASELINE_CONFIRMED',
            entityType: 'ScopeBaseline',
            entityId: baselineId,
            details: { hash: contentHash }
        });

        return this.mapBaselineToDomain(baseline);
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
        const crId = `cr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const cr = await db.change_requests.create({
            data: {
                id: crId,
                project_id: params.projectId,
                scope_baseline_id: params.scopeBaselineId,
                requested_by: params.requestedBy,
                requested_at: new Date(),
                title: params.title,
                description: params.description,
                reason: params.reason,
                classification: params.classification,
                status: ChangeRequestStatus.SUBMITTED,
                impact_status: 'PENDING',
                technical_impact: ImpactLevel.UNKNOWN,
                commercial_impact: ImpactLevel.UNKNOWN,
                schedule_impact: ImpactLevel.UNKNOWN,
                risk_level: 'UNKNOWN'
            }
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_CREATED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: { classification: params.classification }
        });

        return this.mapChangeRequestToDomain(cr);
    }

    async performImpactAnalysis(
        crId: string,
        analystId: string,
        analysis: ImpactAnalysis
    ): Promise<void> {
        await db.change_request_impact_analysis.create({
            data: {
                id: `ana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                change_request_id: crId,
                requirements_impact: analysis.requirementsImpact,
                scope_impact: analysis.scopeImpact,
                solution_impact: analysis.solutionImpact,
                workflow_impact: analysis.workflowImpact,
                delivery_plan_impact: analysis.deliveryPlanImpact,
                schedule_impact: analysis.scheduleImpact,
                commercial_impact: analysis.commercialImpact,
                technical_impact: analysis.technicalImpact,
                risk_impact: analysis.riskImpact,
                affected_items: analysis.affectedItems,
                recommendation: analysis.recommendation,
                confidence: analysis.confidence,
                analyzed_at: new Date(),
                analyzed_by: analystId
            }
        });

        await db.change_requests.update({
            where: { id: crId },
            data: {
                impact_status: 'ANALYZED',
                technical_impact: analysis.technicalImpact,
                commercial_impact: analysis.commercialImpact,
                Lschedule_impact: analysis.scheduleImpact,
                risk_level: analysis.riskImpact
            }
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_ANALYZED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: { risk: analysis.riskImpact }
        });
    }

    async approveChangeRequest(
        crId: string,
        userId: string,
        reason: string
    ): Promise<void> {
        const cr = await db.change_requests.findUnique({
            where: { id: crId }
        });

        if (!cr) {
            throw new Error('CHANGE_REQUEST_NOT_FOUND');
        }

        if (
            cr.status !== ChangeRequestStatus.SUBMITTED &&
            cr.status !== ChangeRequestStatus.IMPACT_ANALYZED
        ) {
            throw new Error('INVALID_CR_STATUS_FOR_APPROVAL');
        }

        // Governance: Use HumanApprovalService for formal sign-off
        await humanApprovalService.requestApproval({
            entityId: crId,
            entityType: 'ChangeRequest',
            approvalType: 'CHANGE_REQUEST' as any,
            requestedBy: userId
        });

        // In a real flow, we'd wait for the decision. For this step, we simulate the final update.
        await db.change_requests.update({
            where: { id: crId },
            data: {
                status: ChangeRequestStatus.APPROVED,
                approved_by: userId,
                approved_at: new Date(),
                decision_reason: reason
            }
        });

        await auditLogger.log({
            action: 'CHANGE_REQUEST_APPROVED',
            entityType: 'ChangeRequest',
            entityId: crId,
            details: { approvedBy: userId }
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
