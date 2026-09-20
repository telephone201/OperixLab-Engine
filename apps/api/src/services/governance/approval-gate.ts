/**
 * @file approval-gate.ts
 * @description Deterministic check for human authorization.
 */

import { ApprovalType, ApprovalDecision } from './types';
import { humanApprovalService } from './approval-service';

export class ApprovalGate {
    /**
     * Verifies if an operation is authorized by a valid human approval.
     */
    async isAuthorized(
        entityId: string,
        type: ApprovalType,
        constraints: {
            workflowVersionId?: string;
            artifactHash?: string;
            environment?: string;
            deploymentId?: string;
        }
    ): Promise<{ authorized: boolean, reason?: string }> {

        const approval = await humanApprovalService.getActiveApproval(entityId, type);

        if (!approval) {
            return { authorized: false, reason: `No active ${type} approval found for entity ${entityId}` };
        }

        // Validation of constraints: ensure the approved artifact/env matches current request
        if (constraints.workflowVersionId && approval.workflowVersionId !== constraints.workflowVersionId) {
            return { authorized: false, reason: 'APPROVAL_INVALIDATED: Workflow version mismatch' };
        }

        if (constraints.artifactHash && approval.artifactHash !== constraints.artifactHash) {
            return { authorized: false, reason: 'APPROVAL_INVALIDATED: Artifact hash mismatch' };
        }

        if (constraints.environment && approval.environment !== constraints.environment) {
            return { authorized: false, reason: 'APPROVAL_INVALIDATED: Environment mismatch' };
        }

        if (constraints.deploymentId && approval.deploymentId !== constraints.deploymentId) {
            return { authorized: false, reason: 'APPROVAL_INVALIDATED: Deployment ID mismatch' };
        }

        return { authorized: true };
    }
}

export const approvalGate = new ApprovalGate();
