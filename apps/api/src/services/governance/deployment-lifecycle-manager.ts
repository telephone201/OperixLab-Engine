/**
 * @file deployment-lifecycle-manager.ts
 * @description Manages deterministic state transitions for workflow deployment and governance.
 */

import { db } from '../lib/db';
import { GovernanceState } from './types';
import { auditLogger } from '../../core/logging/audit-logger';

export class DeploymentLifecycleManager {
    /**
     * Transitions the state of a deployment.
     */
    async transition(params: {
        deploymentId: string;
        fromState: GovernanceState;
        newState: GovernanceState;
        actor: string;
        reason: string;
        metadata?: any;
    }): Promise<void> {

        // 1. Validate Transition
        this.validateTransition(params.fromState, params.newState);

        // 2. Persist Transition (Append-only)
        await db.workflow_lifecycle_transitions.create({
            data: {
                id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                entity_type: 'WorkflowDeployment',
                entity_id: params.deploymentId,
                previous_state: params.fromState,
                new_state: params.newState,
                actor: params.actor,
                reason: params.reason,
                timestamp: new Date(),
                metadata: params.metadata
            }
        });

        // 3. Update Current Status in deployment table
        await db.workflow_deployments.update({
            where: { id: params.deploymentId },
            data: { status: params.newState }
        });

        // 4. Audit Log
        await auditLogger.log({
            action: `LIFECYCLE_TRANSITION_${params.newState}`,
            entityType: 'WorkflowDeployment',
            entityId: params.deploymentId,
            details: { from: params.fromState, reason: params.reason }
        });
    }

    private validateTransition(from: GovernanceState, to: GovernanceState) {
        const allowed: Record<string, string[]> = {
            [GovernanceState.GOVERNANCE_PENDING]: [GovernanceState.DEPLOYMENT_APPROVAL_PENDING],
            [GovernanceState.DEPLOYMENT_APPROVAL_PENDING]: [GovernanceState.DEPLOYMENT_APPROVED, GovernanceState.DEPLOYMENT_REJECTED],
            [GovernanceState.DEPLOYMENT_APPROVED]: [GovernanceState.DEPLOYMENT_IN_PROGRESS],
            [GovernanceState.DEPLOYMENT_IN_PROGRESS]: [GovernanceState.DEPLOYMENT_VERIFIED, GovernanceState.DEPLOYMENT_FAILED],
            [GovernanceState.DEPLOYMENT_VERIFIED]: [GovernanceState.ACTIVATION_APPROVAL_PENDING],
            [GovernanceState.ACTIVATION_APPROVAL_PENDING]: [GovernanceState.ACTIVATION_APPROVED, GovernanceState.ACTIVATION_REJECTED],
            [GovernanceState.ACTIVATION_APPROVED]: [GovernanceState.ACTIVATION_IN_PROGRESS],
            [GovernanceState.ACTIVATION_IN_PROGRESS]: [GovernanceState.ACTIVE, GovernanceState.ACTIVATION_FAILED],
            [GovernanceState.ACTIVE]: [GovernanceState.KNOWN_GOOD, GovernanceState.ROLLBACK_ELIGIBILITY_CHECK, GovernanceState.SUSPENDED],
            [GovernanceState.ROLLBACK_ELIGIBILITY_CHECK]: [GovernanceState.ROLLBACK_APPROVAL_PENDING, GovernanceState.ROLLBACK_REJECTED],
            [GovernanceState.ROLLBACK_APPROVAL_PENDING]: [GovernanceState.ROLLBACK_APPROVED, GovernanceState.ROLLBACK_REJECTED],
            [GovernanceState.ROLLBACK_APPROVED]: [GovernanceState.ROLLBACK_IN_PROGRESS],
            [GovernanceState.ROLLBACK_IN_PROGRESS]: [GovernanceState.ROLLBACK_VERIFIED, GovernanceState.ROLLBACK_FAILED],
            [GovernanceState.ROLLBACK_VERIFIED]: [GovernanceState.ACTIVE]
        };

        if (!allowed[from] || !allowed[from].includes(to)) {
            throw new Error(`INVALID_STATE_TRANSITION: Cannot move from ${from} to ${to}`);
        }
    }
}

export const deploymentLifecycleManager = new DeploymentLifecycleManager();
