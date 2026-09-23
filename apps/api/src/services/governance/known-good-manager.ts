/**
 * @file known-good-manager.ts
 * @description Manages versions certified as safe for rollback.
 */

import { db } from '../../lib/db';
import { DeploymentEnvironment } from '../deployment/types';
import { KnownGoodVersion } from './types';
import crypto from 'crypto';

export class KnownGoodVersionManager {
    /**
     * Certifies a version as Known-Good for a specific environment.
     * Only called after a workflow is ACTIVE and VERIFIED.
     */
    async certifyVersion(params: {
        workflowVersionId: string;
        environment: DeploymentEnvironment;
        deploymentId: string;
        n8nWorkflowId: string;
        artifactHash: string;
        userId: string;
        reason: string;
    }): Promise<string> {
        const knownGoodId = crypto.randomUUID();

        await db.known_good_versions.create({
            data: {
                id: knownGoodId,
                workflow_version_id: params.workflowVersionId,
                environment: params.environment,
                deployment_id: params.deploymentId,
                n8n_workflow_id: params.n8nWorkflowId,
                artifact_hash: params.artifactHash,
                marked_by: params.userId,
                marked_at: new Date(),
                reason: params.reason,
                status: 'CERTIFIED'
            }
        });

        return knownGoodId;
    }

    /**
     * Retrieves the most recent, non-revoked Known-Good version for an environment.
     */
    async getLatestKnownGood(environment: DeploymentEnvironment): Promise<KnownGoodVersion | null> {
        const kg = await db.known_good_versions.findFirst({
            where: {
                environment: environment,
                revoked_at: null
            },
            orderBy: { marked_at: 'desc' }
        });

        if (!kg) return null;

        return {
            knownGoodId: kg.id,
            workflowVersionId: kg.workflow_version_id,
            artifactHash: kg.artifact_hash,
            environment: kg.environment,
            deploymentId: kg.deployment_id,
            n8nWorkflowId: kg.n8n_workflow_id,
            markedAt: kg.marked_at,
            markedBy: kg.marked_by,
            reason: kg.reason
        };
    }

    /**
     * Revokes a Known-Good version due to discovery of latent defects.
     */
    async revokeVersion(knownGoodId: string, userId: string, reason: string): Promise<void> {
        await db.known_good_versions.update({
            where: { id: knownGoodId },
            data: {
                revoked_by: userId,
                revoked_at: new Date(),
                revocation_reason: reason
            }
        });
    }
}

export const knownGoodVersionManager = new KnownGoodVersionManager();

