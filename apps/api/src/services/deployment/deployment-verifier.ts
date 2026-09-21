import { DeploymentVerification } from './types';
import { n8nProvider } from './providers/n8n-provider';
import crypto from 'crypto';

export class DeploymentVerifier {
    async verify(
        deploymentId: string,
        n8nWorkflowId: string,
        expectedArtifactContent: Buffer
    ): Promise<DeploymentVerification> {
        console.log(`[VERIFY] Verifying deployment ${deploymentId} at n8n ID ${n8nWorkflowId}...`);

        try {
            const artifactWorkflow = JSON.parse(
                expectedArtifactContent.toString('utf8')
            );

            const expectedContent = this.normalizeWorkflow(artifactWorkflow);
            const expectedHash = this.hashCanonicalWorkflow(expectedContent);

            const deployedWorkflow = await n8nProvider.getWorkflow(n8nWorkflowId);

            const deployedContent = this.normalizeWorkflow(deployedWorkflow);
            const deployedHash = this.hashCanonicalWorkflow(deployedContent);

            const status =
                deployedHash === expectedHash
                    ? 'VERIFIED'
                    : 'VERIFICATION_FAILED';

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
                expectedHash: '',
                verifiedAt: new Date()
            };
        }
    }

    private normalizeWorkflow(workflow: any) {
        return {
            nodes: workflow.nodes || [],
            connections: workflow.connections || {}
        };
    }

    private hashCanonicalWorkflow(workflow: any): string {
        return crypto
            .createHash('sha256')
            .update(JSON.stringify(workflow))
            .digest('hex');
    }
}

export const deploymentVerifier = new DeploymentVerifier();
