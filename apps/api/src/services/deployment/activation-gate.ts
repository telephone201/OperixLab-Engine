/**
 * @file activation-gate.ts
 * @description Separate gate for activating a deployed workflow.
 */

import { DeploymentStatus } from './types';
import { db } from '../lib/db';

export class ActivationGate {
    /**
     * Checks if a deployment is eligible for activation.
     */
    async canActivate(deploymentId: string, authorized: boolean): Promise<{ canActivate: boolean, reason?: string }> {
        const deployment = await db.workflow_deployments.findUnique({ where: { id: deploymentId } });

        if (!deployment) return { canActivate: false, reason: 'DEPLOYMENT_NOT_FOUND' };

        // 1. Deployment Status must be VERIFIED
        if (deployment.status !== DeploymentStatus.VERIFIED) {
            return { canActivate: false, reason: `Deployment must be VERIFIED (Current: ${deployment.status})` };
        }

        // 2. Activation Authorization
        if (!authorized) {
            return { canActivate: false, reason: 'ACTIVATION_NOT_AUTHORIZED' };
        }

        return { canActivate: true };
    }
}

export const activationGate = new ActivationGate();
