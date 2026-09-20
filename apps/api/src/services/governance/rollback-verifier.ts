/**
 * @file rollback-verifier.ts
 * @description Verifies that a rollback operation has successfully restored the target version.
 */

import { db } from '../lib/db';
import { RollbackOperation } from './types';
import { n8nProvider } from '../deployment/providers/n8n-provider';
import { deploymentVerifier } from '../deployment/deployment-verifier';
import { DeploymentEnvironment } from '../deployment/types';

export class RollbackVerifier {
    /**
     * Verifies the state of n8n after a rollback execution.
     */
    async verifyRollback(params: {
        rollbackId: string;
        targetVersionId: string;
        targetArtifactHash: string;
        n8nWorkflowId: string;
        environment: DeploymentEnvironment;
    }): Promise<{ verified: boolean, status: 'VERIFIED' | 'FAILED' | 'REQUIRES_REVIEW', reason?: string }> {

        console.log(`[ROLLBACK-VERIFY] Verifying rollback ${params.rollbackId} for workflow ${params.n8nWorkflowId}...`);

        try {
            // 1. Verify Workflow Existence and Identity
            const workflow = await n8nProvider.getWorkflow(params.n8nWorkflowId);
            if (!workflow) {
                return { verified: false, status: 'FAILED', reason: 'n8n workflow not found' };
            }

            // 2. Verify Active State
            if (!workflow.active) {
                return { verified: false, status: 'FAILED', reason: 'Workflow is not active after rollback' };
            }

            // 3. Content Hash Verification
            // We reuse the deploymentVerifier's logic for normalized comparison
            const verification = await deploymentVerifier.verify(
                params.rollbackId,
                params.n8nWorkflowId,
                params.targetArtifactHash
            );

            if (verification.status !== 'VERIFIED') {
                return {
                    verified: false,
                    status: verification.status === 'VERIFICATION_FAILED' ? 'FAILED' : 'REQUIRES_REVIEW',
                    reason: `Hash mismatch: ${verification.deployedHash} != ${verification.expectedHash}`
                };
            }

            return { verified: true, status: 'VERIFIED' };
        } catch (error: any) {
            console.error(`[ROLLBACK-VERIFY] Error during verification:`, error);
            return { verified: false, status: 'FAILED', reason: error.message };
        }
    }
}

export const rollbackVerifier = new RollbackVerifier();
