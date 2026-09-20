/**
 * @file deployment-verifier.ts
 * @description Verifies that the deployed workflow matches the intended artifact.
 */

import { DeploymentVerification } from './types';
import { n8nProvider } from './providers/n8n-provider';
import crypto from 'crypto';

export class DeploymentVerifier {
    /**
     * Verifies the deployed workflow in n8n.
     */
    async verify(deploymentId: string, n8nWorkflowId: string, expectedHash: string): Promise<DeploymentVerification> {
        console.log(`[VERIFY] Verifying deployment ${deploymentId} at n8n ID ${n8nWorkflowId}...`);

        try {
            const deployedWorkflow = await n8nProvider.getWorkflow(n8nWorkflowId);

            // Normalization Strategy:
            // n8n may add metadata or change order.
            // We normalize the JSON by sorting keys and removing n8n-specific metadata fields if necessary.
            const normalizedContent = this.normalizeWorkflow(deployedWorkflow);
            const deployedHash = crypto.createHash('sha256').update(JSON.stringify(normalizedContent)).digest('hex');

            const status = deployedHash === expectedHash ? 'VERIFIED' : 'VERIFICATION_FAILED';

            return {
                verificationId: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                deploymentId,
                status,
                deployedHash,
                expectedHash,
                verifiedAt: new Date()
            };
        } catch (error) {
            console.error(`[VERIFY] Verification error:`, error);
            return {
                verificationId: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                deploymentId,
                status: 'VERIFICATION_FAILED',
                deployedHash: '',
                expectedHash,
                verifiedAt: new Date()
            };
        }
    }

    private normalizeWorkflow(workflow: any) {
        // Simplified normalization: only keep nodes and connections
        return {
            nodes: workflow.nodes,
            connections: workflow.connections
        };
    }
}

export const deploymentVerifier = new DeploymentVerifier();
