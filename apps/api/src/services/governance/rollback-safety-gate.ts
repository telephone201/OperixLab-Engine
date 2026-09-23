/**
 * @file rollback-safety-gate.ts
 * @description Verifies that a rollback target is safe and eligible.
 */

import { db } from '../../lib/db';
import { KnownGoodVersion } from './types';
import { DeploymentEnvironment } from '../deployment/types';
import { artifactService } from '../versioning/artifact-service';

export class RollbackSafetyGate {
    /**
     * Performs a comprehensive check on a potential rollback target.
     */
    async checkEligibility(
        target: KnownGoodVersion,
        environment: DeploymentEnvironment
    ): Promise<{ eligible: boolean, reason?: string }> {

        // 1. Environment Match
        if (target.environment !== environment) {
            return { eligible: false, reason: 'ROLLBACK_BLOCKED: Environment mismatch' };
        }

        // 2. Artifact Integrity Check
        const artifact = await db.workflow_artifacts.findUnique({
            where: { id: (await db.workflow_versions.findUnique({ where: { id: target.workflowVersionId } }))!.artifact_id }
        });

        if (!artifact) return { eligible: false, reason: 'ROLLBACK_BLOCKED: Artifact not found' };

        const currentContent = await artifactService.getArtifactContent(artifact.id);
        const currentHash = require('crypto').createHash('sha256').update(currentContent).digest('hex');

        if (currentHash !== target.artifactHash) {
            return { eligible: false, reason: 'ROLLBACK_BLOCKED: Target artifact hash mismatch' };
        }

        // 3. Validation Status Re-Verification
        const validation = await db.workflow_validations.findFirst({
            where: {
                workflow_version_id: target.workflowVersionId,
                status: 'PASSED'
            },
            orderBy: { started_at: 'desc' }
        });

        if (!validation) {
            return { eligible: false, reason: 'ROLLBACK_BLOCKED: Target version no longer PASSED' };
        }

        return { eligible: true };
    }
}

export const rollbackSafetyGate = new RollbackSafetyGate();

