/**
 * @file eligibility-gate.ts
 * @description Deterministic hard gate for deployment eligibility.
 */

import { DeploymentStatus, DeploymentErrorCode } from './types';
import { db } from '../lib/db';

export class DeploymentEligibilityGate {
    /**
     * Checks if a workflow version is eligible for deployment.
     * Returns { eligible: boolean, reason?: DeploymentErrorCode }
     */
    async checkEligibility(
        versionId: string,
        artifactHash: string,
        currentArtifactHash: string,
        environment: string,
        authorized: boolean
    ): Promise<{ eligible: boolean, reason?: DeploymentErrorCode }> {

        // 1. Artifact Integrity Check
        if (artifactHash !== currentArtifactHash) {
            return { eligible: false, reason: 'ARTIFACT_HASH_MISMATCH' };
        }

        // 2. Validation Status Check
        const validation = await db.workflow_validations.findFirst({
            where: {
                workflow_version_id: versionId,
                // We look for the latest validation run
            },
            orderBy: { created_at: 'desc' }
        });

        if (!validation || validation.status !== 'PASSED') {
            return { eligible: false, reason: 'VALIDATION_NOT_PASSED' };
        }

        // 3. Environment Check
        if (!environment) {
            return { eligible: false, reason: 'ENVIRONMENT_REQUIRED' };
        }

        // 4. Authorization Check
        if (!authorized) {
            return { eligible: false, reason: 'DEPLOYMENT_NOT_AUTHORIZED' };
        }

        return { eligible: true };
    }
}

export const deploymentEligibilityGate = new DeploymentEligibilityGate();
