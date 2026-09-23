/**
 * @file safety-pipeline.ts
 * @description Deterministic safety pipeline for workflow deployment.
 */

import {
    DeploymentStatus,
    DeploymentEnvironment,
    DeploymentMode,
    DeploymentManifest,
    DeploymentErrorCode
} from './types';
import { deploymentEligibilityGate } from './eligibility-gate';
import { db } from '../../lib/db';
import { artifactService } from '../versioning/artifact-service';
import crypto from 'crypto';

export class DeploymentSafetyPipeline {
    /**
     * Orchestrates the pre-deployment safety checks.
     */
    async evaluate(
        versionId: string,
        environment: DeploymentEnvironment,
        authorized: boolean,
        requestedBy: string
    ): Promise<{ eligible: boolean, manifest?: DeploymentManifest, reason?: DeploymentErrorCode }> {

        console.log(`[SAFETY] Evaluating deployment for version ${versionId} to ${environment}...`);

        // 1. Resolve Workflow Version and Artifact
        const version = await db.workflow_versions.findUnique({ where: { id: versionId } });
        if (!version) return { eligible: false, reason: 'WORKFLOW_VERSION_NOT_FOUND' };

        const artifact = await db.workflow_artifacts.findUnique({ where: { id: version.artifact_id } });
        if (!artifact) return { eligible: false, reason: 'ARTIFACT_NOT_FOUND' };

        // 2. Verify Current Artifact Hash
        const currentContent = await artifactService.getArtifactContent(artifact.id);
        const currentHash = this.calculateHash(currentContent);
        if (currentHash !== version.content_hash) {
            return { eligible: false, reason: 'ARTIFACT_HASH_MISMATCH' };
        }

        // 3. Eligibility Gate (Validation & Auth)
        const eligibility = await deploymentEligibilityGate.checkEligibility(
            versionId,
            version.content_hash,
            currentHash,
            environment,
            authorized
        );

        if (!eligibility.eligible) {
            return { eligible: false, reason: eligibility.reason };
        }

        // 4. Resolve Target Identity & Mode
        const bindingResult = await db.query(
            `
            SELECT workflow_version_id, environment, n8n_workflow_id
            FROM workflow_environment_bindings
            WHERE workflow_version_id = $1
              AND environment = $2
            LIMIT 1
            `,
            [versionId, environment]
        );
        const binding = bindingResult.rows[0] ?? null;

        const mode = binding ? DeploymentMode.UPDATE : DeploymentMode.CREATE;

        // 5. Construct Manifest
        const manifest: DeploymentManifest = {
            deploymentId: crypto.randomUUID(),
            workflowVersionId: versionId,
            artifactId: artifact.id,
            artifactHash: version.content_hash,
            solutionId: version.solution_id,
            solutionVersionId: version.solution_version_id,
            originType: version.origin_type,
            environment,
            requestedBy,
            requestedAt: new Date(),
            validationId: '', // To be populated from latest PASSED validation
            validationRulesetVersion: '1.0.0',
            n8nTarget: '',
            existingN8nWorkflowId: binding?.n8n_workflow_id,
            deploymentMode: mode,
            activationRequested: false // Default, overridden by service
        };

        // Populate validationId
        const lastValidation = await db.workflow_validations.findFirst({
            where: { workflow_version_id: versionId, status: 'PASSED' },
            orderBy: { completed_at: 'desc' }
        });
        manifest.validationId = lastValidation?.id || '';

        return { eligible: true, manifest };
    }

    private calculateHash(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }
}

export const deploymentSafetyPipeline = new DeploymentSafetyPipeline();

