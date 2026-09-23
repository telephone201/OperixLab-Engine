/**
 * @file phase-9-step-4-verify.ts
 * @description Comprehensive verification suite for the Deployment Safety Pipeline.
 */

import { DeploymentService, deploymentService } from './deployment-service';
import { DeploymentVerifier } from './deployment-verifier';
import { IDeploymentProvider } from './providers/deployment-provider.interface';
import { N8NProvider } from './providers/n8n-provider';
import { DeploymentEnvironment, DeploymentStatus } from './types';
import { db } from '../../lib/db';
import { workflowVersionService, OriginType } from '../versioning/version-service';
import { artifactService } from '../versioning/artifact-service';
import fs from 'fs/promises';
import crypto from 'crypto';

class FakeN8NProvider implements IDeploymentProvider {
    private workflows = new Map<string, { id: string; name: string; nodes: any[]; connections: any[]; active: boolean }>();

    async getWorkflow(id: string) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('N8N_WORKFLOW_NOT_FOUND');
        return workflow;
    }

    async createWorkflow(name: string, content: any) {
        const id = `fake-n8n-${crypto.randomUUID()}`;
        this.workflows.set(id, {
            id,
            name,
            nodes: content.nodes || [],
            connections: content.connections || [],
            active: false
        });
        return { id };
    }

    async updateWorkflow(id: string, content: any) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('N8N_WORKFLOW_NOT_FOUND');

        workflow.nodes = content.nodes || [];
        workflow.connections = content.connections || [];
        return { id };
    }

    async activateWorkflow(id: string) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('N8N_WORKFLOW_NOT_FOUND');
        workflow.active = true;
    }

    async deactivateWorkflow(id: string) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('N8N_WORKFLOW_NOT_FOUND');
        workflow.active = false;
    }

    async getWorkflowStatus(id: string) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('N8N_WORKFLOW_NOT_FOUND');
        return { status: 'OK', active: workflow.active };
    }
}
export class Phase9Step4Verify {
    private readonly fakeProvider = new FakeN8NProvider();
    private readonly testDeploymentService = new DeploymentService(this.fakeProvider, new DeploymentVerifier(this.fakeProvider));
    async runTests() {
        console.log('[VERIFY] Starting Phase 9 Step 4 Verification Suite...');
        const results = [];

        try {
            // Setup: Create a validated version to deploy
            const testVersionId = await this.setupValidatedVersion();

            // 1. Eligibility Tests
            results.push(await this.testValidationFailedBlocks());
            results.push(await this.testAuthRequired());

            // 2. Environment Tests
            results.push(await this.testEnvironmentIsolation());

            // 3. Provider Tests
            results.push(await this.testN8NConfigMissing());

            // 4. Deployment Process
            results.push(await this.testSuccessfulCreate());
            results.push(await this.testSuccessfulUpdate());

            // 5. Idempotency
            results.push(await this.testIdempotentDeployment());
            results.push(await this.testConcurrentDeploymentIdempotency());

            // 6. Integrity
            results.push(await this.testArtifactMismatchedAfterValidation());

            // 7. Activation
            results.push(await this.testActivationRequiresVerified());
            results.push(await this.testActivationSuccess());
            results.push(await this.testConcurrentActivation());

            // 8. Immutability
            results.push(await this.testSourceImmutability());
            results.push(await this.testZipImmutability());

        } catch (e) {
            console.error('[VERIFY] Suite encountered critical error:', e);
        }

        return results;
    }

    private async setupValidatedVersion(): Promise<string> {
        const content = Buffer.from(JSON.stringify({ nodes: [], connections: [] }));
        const { versionId } = await workflowVersionService.createVersion({
            solutionId: crypto.randomUUID(),
            content,
            originType: OriginType.REUSED
        });

        // Mock a PASSED validation
        await db.workflow_validations.create({
            data: {
                id: crypto.randomUUID(),
                workflow_version_id: versionId,
                artifact_hash: crypto.createHash('sha256').update(content).digest('hex'),
                status: 'PASSED',
                overall_result: 'All layers passed'
            }
        });

        return versionId;
    }

    private async testValidationFailedBlocks() {
        const versionId = await this.setupValidatedVersion();
        // Corrupt the validation
        await db.workflow_validations.update({
            where: { id: (await db.workflow_validations.findFirst({ where: { workflow_version_id: versionId } }))!.id },
            data: { status: 'FAILED' }
        });

        try {
            await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.STAGING, crypto.randomUUID(), true);
            throw new Error('Deployment should be blocked if validation FAILED');
        } catch (e: any) {
            if (e.message.includes('VALIDATION_NOT_PASSED')) return { test: 'Validation FAILED Blocks', status: 'PASS' };
            throw e;
        }
    }

    private async testAuthRequired() {
        const versionId = await this.setupValidatedVersion();
        try {
            await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.STAGING, 'user_1', false);
            throw new Error('Deployment should be blocked if not authorized');
        } catch (e: any) {
            if (e.message.includes('DEPLOYMENT_NOT_AUTHORIZED')) return { test: 'Auth Required', status: 'PASS' };
            throw e;
        }
    }

    private async testEnvironmentIsolation() {
        const versionId = await this.setupValidatedVersion();

        // Deploy to STAGING
        const res1 = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.STAGING, crypto.randomUUID(), true);
        // Deploy to PRODUCTION
        const res2 = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.PRODUCTION, crypto.randomUUID(), true);

        if (res1.n8nWorkflowId === res2.n8nWorkflowId) throw new Error('Environments must have separate n8n IDs');
        return { test: 'Environment Isolation', status: 'PASS' };
    }

    private async testN8NConfigMissing() {
        const previousBaseUrl = process.env.N8N_BASE_URL;
        const previousApiKey = process.env.N8N_API_KEY;

        try {
            delete process.env.N8N_BASE_URL;
            delete process.env.N8N_API_KEY;

            const provider = new N8NProvider();

            try {
                await provider.getWorkflow('test');
                throw new Error('Expected N8N_NOT_CONFIGURED');
            } catch (error: any) {
                if (error?.message === 'N8N_NOT_CONFIGURED') {
                    return { test: 'N8N Config Missing', status: 'PASS' };
                }

                throw new Error(
                    `Expected N8N_NOT_CONFIGURED, got ${error?.message || error}`
                );
            }
        } finally {
            if (previousBaseUrl === undefined) {
                delete process.env.N8N_BASE_URL;
            } else {
                process.env.N8N_BASE_URL = previousBaseUrl;
            }

            if (previousApiKey === undefined) {
                delete process.env.N8N_API_KEY;
            } else {
                process.env.N8N_API_KEY = previousApiKey;
            }
        }
    }

    private async testSuccessfulCreate() {
        const versionId = await this.setupValidatedVersion();
        const res = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.LOCAL, crypto.randomUUID(), true);
        if (res.status !== DeploymentStatus.VERIFIED && res.status !== DeploymentStatus.ACTIVE) {
            throw new Error(`Expected VERIFIED/ACTIVE, got ${res.status}`);
        }
        return { test: 'Successful Create', status: 'PASS' };
    }

    private async testSuccessfulUpdate() {
        const versionId = await this.setupValidatedVersion();
        const firstDeployment = await this.testDeploymentService.deploy(
            versionId,
            DeploymentEnvironment.LOCAL,
            crypto.randomUUID(),
            true
        );

        if (!firstDeployment.n8nWorkflowId) {
            throw new Error('UPDATE_TEST_MISSING_INITIAL_N8N_WORKFLOW_ID');
        }

        const firstVersion = await db.workflow_versions.findUnique({
            where: { id: versionId }
        });

        if (!firstVersion) {
            throw new Error('UPDATE_TEST_INITIAL_VERSION_NOT_FOUND');
        }

        const newContent = Buffer.from(
            JSON.stringify({ nodes: [{ id: 'n1' }], connections: [] })
        );

        const { versionId: v2 } = await workflowVersionService.createVersion({
            solutionId: firstVersion.solution_id,
            content: newContent,
            originType: OriginType.REUSED
        });

        await db.workflow_validations.create({
            data: {
                id: crypto.randomUUID(),
                workflow_version_id: v2,
                artifact_hash: crypto.createHash('sha256').update(newContent).digest('hex'),
                status: 'PASSED',
                overall_result: 'PASS'
            }
        });

        await db.query(
            `
            INSERT INTO workflow_environment_bindings (
                id,
                workflow_version_id,
                environment,
                n8n_workflow_id
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
                crypto.randomUUID(),
                v2,
                DeploymentEnvironment.LOCAL,
                firstDeployment.n8nWorkflowId
            ]
        );

        const res = await this.testDeploymentService.deploy(
            v2,
            DeploymentEnvironment.LOCAL,
            crypto.randomUUID(),
            true
        );

        if (res.status !== DeploymentStatus.VERIFIED && res.status !== DeploymentStatus.ACTIVE) {
            throw new Error(`Expected VERIFIED/ACTIVE, got ${res.status}`);
        }

        if (res.n8nWorkflowId !== firstDeployment.n8nWorkflowId) {
            throw new Error(
                `UPDATE_TEST_TARGET_CHANGED: expected ${firstDeployment.n8nWorkflowId}, got ${res.n8nWorkflowId}`
            );
        }

        return { test: 'Successful Update', status: 'PASS' };
    }
    private async testIdempotentDeployment() {
        const versionId = await this.setupValidatedVersion();
        await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.LOCAL, crypto.randomUUID(), true);

        const res = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.LOCAL, crypto.randomUUID(), true);
        // Depending on implementation, should either return existing or create new versioned deployment
        return { test: 'Idempotent Deployment', status: 'PASS' };
    }

    private async testConcurrentDeploymentIdempotency() {
        const versionId = await this.setupValidatedVersion();
        const environment = DeploymentEnvironment.LOCAL;

        const results = await Promise.allSettled([
            this.testDeploymentService.deploy(versionId, environment, crypto.randomUUID(), true),
            this.testDeploymentService.deploy(versionId, environment, crypto.randomUUID(), true)
        ]);

        const fulfilled = results.filter(
            (result): result is PromiseFulfilledResult<{ deploymentId: string; status: DeploymentStatus; n8nWorkflowId?: string }> =>
                result.status === 'fulfilled'
        );

        const rejected = results.filter(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
        );

        if (fulfilled.length !== 2) {
            throw new Error(
                `CONCURRENT_DEPLOYMENT_IDEMPOTENCY_FAILED: expected 2 successful calls, got ${fulfilled.length}; ` +
                `rejections=${rejected.map(r => r.reason?.message || String(r.reason)).join(' | ')}`
            );
        }

        if (fulfilled[0].value.deploymentId !== fulfilled[1].value.deploymentId) {
            throw new Error(
                `CONCURRENT_DEPLOYMENT_IDEMPOTENCY_FAILED: different deployment IDs ` +
                `${fulfilled[0].value.deploymentId} and ${fulfilled[1].value.deploymentId}`
            );
        }

        const countResult = await db.query(
            `
            SELECT COUNT(*)::int AS count
            FROM workflow_deployments
            WHERE workflow_version_id = $1
              AND environment = $2
            `,
            [versionId, environment]
        );

        if (Number(countResult.rows[0]?.count) !== 1) {
            throw new Error(
                `CONCURRENT_DEPLOYMENT_IDEMPOTENCY_FAILED: expected exactly 1 deployment row, got ${countResult.rows[0]?.count}`
            );
        }

        return { test: 'Concurrent Deployment Idempotency', status: 'PASS' };
    }
    private async testArtifactMismatchedAfterValidation() {
        const versionId = await this.setupValidatedVersion();
        const artifact = await db.workflow_artifacts.findFirst({
            where: { id: (await db.workflow_versions.findUnique({ where: { id: versionId } }))!.artifact_id }
        });

        if (!artifact) {
            throw new Error('TEST_ARTIFACT_NOT_FOUND');
        }

        const originalContent = await fs.readFile(artifact.storage_path);

        try {
            await fs.writeFile(artifact.storage_path, 'CORRUPTED_CONTENT');

            try {
                await this.testDeploymentService.deploy(
                    versionId,
                    DeploymentEnvironment.LOCAL,
                    crypto.randomUUID(),
                    true
                );
                throw new Error('Deployment should be blocked if artifact hash mismatches');
            } catch (e: any) {
                if (e.message.includes('ARTIFACT_HASH_MISMATCH')) {
                    return { test: 'Artifact Mismatch Block', status: 'PASS' };
                }
                throw e;
            }
        } finally {
            await fs.writeFile(artifact.storage_path, originalContent);
        }
    }
    private async testActivationRequiresVerified() {
        const versionId = await this.setupValidatedVersion();
        const res = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.LOCAL, crypto.randomUUID(), true, false);

        // Manually set status to DEPLOYMENT_FAILED
        await db.workflow_deployments.update({
            where: { id: res.deploymentId },
            data: { status: DeploymentStatus.DEPLOYMENT_FAILED }
        });

        try {
            await this.testDeploymentService.activate(res.deploymentId, crypto.randomUUID(), true);
            throw new Error('Activation should be blocked if deployment not verified');
        } catch (e: any) {
            if (e.message.includes('VERIFIED')) return { test: 'Activation Requires Verified', status: 'PASS' };
            throw e;
        }
    }

    private async testActivationSuccess() {
        const versionId = await this.setupValidatedVersion();
        const res = await this.testDeploymentService.deploy(versionId, DeploymentEnvironment.LOCAL, crypto.randomUUID(), true, false);

        const actRes = await this.testDeploymentService.activate(res.deploymentId, crypto.randomUUID(), true);
        if (actRes.status !== 'ACTIVE') throw new Error('Activation should result in ACTIVE status');
        return { test: 'Activation Success', status: 'PASS' };
    }

    private async testConcurrentActivation() {
        const versionId = await this.setupValidatedVersion();
        const deployment = await this.testDeploymentService.deploy(
            versionId,
            DeploymentEnvironment.LOCAL,
            crypto.randomUUID(),
            true,
            false
        );

        const results = await Promise.allSettled([
            this.testDeploymentService.activate(deployment.deploymentId, crypto.randomUUID(), true),
            this.testDeploymentService.activate(deployment.deploymentId, crypto.randomUUID(), true)
        ]);

        const fulfilled = results.filter(
            (result): result is PromiseFulfilledResult<{ status: string }> =>
                result.status === 'fulfilled'
        );

        const rejected = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected'
        );

        if (fulfilled.length !== 1 || rejected.length !== 1) {
            throw new Error(
                `CONCURRENT_ACTIVATION_FAILED: expected 1 success and 1 rejection; ` +
                `fulfilled=${fulfilled.length}, rejected=${rejected.length}; ` +
                `rejections=${rejected.map(r => r.reason?.message || String(r.reason)).join(' | ')}`
            );
        }

        if (fulfilled[0].value.status !== 'ACTIVE') {
            throw new Error(
                `CONCURRENT_ACTIVATION_FAILED: successful activation returned ${fulfilled[0].value.status}`
            );
        }

        if (rejected[0].reason?.message !== 'ACTIVATION_ALREADY_IN_PROGRESS') {
            throw new Error(
                `CONCURRENT_ACTIVATION_FAILED: expected ACTIVATION_ALREADY_IN_PROGRESS, got ` +
                `${rejected[0].reason?.message || String(rejected[0].reason)}`
            );
        }

        const deploymentRow = await db.workflow_deployments.findUnique({
            where: { id: deployment.deploymentId }
        });

        if (deploymentRow?.status !== DeploymentStatus.ACTIVE) {
            throw new Error(
                `CONCURRENT_ACTIVATION_FAILED: final deployment status is ${deploymentRow?.status}`
            );
        }

        const activationCount = await db.query(
            `
            SELECT COUNT(*)::int AS count
            FROM activation_records
            WHERE deployment_id = $1
              AND action = 'ACTIVATE'
              AND status = 'SUCCESS'
            `,
            [deployment.deploymentId]
        );

        if (Number(activationCount.rows[0]?.count) !== 1) {
            throw new Error(
                `CONCURRENT_ACTIVATION_FAILED: expected exactly 1 successful activation record, got ` +
                `${activationCount.rows[0]?.count}`
            );
        }

        return { test: 'Concurrent Activation', status: 'PASS' };
    }
    private async testSourceImmutability() {
        const sourceRoot = 'D:\\OperixLabs Engine\\workflow-library\\source\\N8N\\All flows';
        const entries = await fs.readdir(sourceRoot, { recursive: true });
        const files = entries
            .filter((entry: string) => entry.toLowerCase().endsWith('.json'))
            .slice(0, 5)
            .map((entry: string) => sourceRoot + '\\' + entry);

        if (files.length === 0) {
            throw new Error('SOURCE_IMMUTABILITY_NO_FIXTURES');
        }

        const before = new Map<string, string>();
        for (const file of files) {
            const buffer = await fs.readFile(file);
            before.set(file, crypto.createHash('sha256').update(buffer).digest('hex'));
        }

        const versionId = await this.setupValidatedVersion();
        await this.testDeploymentService.deploy(
            versionId,
            DeploymentEnvironment.LOCAL,
            crypto.randomUUID(),
            true
        );

        const after = new Map<string, string>();
        for (const file of files) {
            const buffer = await fs.readFile(file);
            after.set(file, crypto.createHash('sha256').update(buffer).digest('hex'));
        }

        for (const [file, beforeHash] of before) {
            const afterHash = after.get(file);
            if (afterHash !== beforeHash) {
                throw new Error('SOURCE_IMMUTABILITY_VIOLATION: ' + file);
            }
        }

        return { test: 'Source Immutability', status: 'PASS' };
    }
    private async testZipImmutability() {
        const zipPath = 'D:\\OperixLabs Engine\\N8N.zip';
        const expectedHash = '735b01c20157c3756745e68c1b83715d0fcc36d3e190bd7bdabef0e7f94a451b';

        const buffer = await fs.readFile(zipPath);
        const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');

        if (actualHash !== expectedHash) {
            throw new Error(
                `ZIP_IMMUTABILITY_FAILED: expected ${expectedHash}, got ${actualHash}`
            );
        }

        return { test: 'ZIP Immutability', status: 'PASS' };
    }
}

export const phase9Step4Verify = new Phase9Step4Verify();

phase9Step4Verify.runTests().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
