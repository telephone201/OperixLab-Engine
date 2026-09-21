/**
 * @file version-service.ts
 * @description Implements immutable workflow versioning and version chains.
 */

import { db } from '../../lib/db';
import { artifactService } from './artifact-service';
import { hashService } from './hash-service';
import { auditLogger } from '../../core/logging/audit-logger';

export enum VersionStatus {
    DRAFT = 'DRAFT',
    FINALIZED = 'FINALIZED',
    SUPERSEDED = 'SUPERSEDED',
    ARCHIVED = 'ARCHIVED'
}

export enum OriginType {
    REUSED = 'REUSED',
    CUSTOMIZED = 'CUSTOMIZED',
    COMPOSED = 'COMPOSED',
    CUSTOM_BUILT = 'CUSTOM_BUILT'
}

export interface VersionRequest {
    workflowSourceId?: string; // Optional for CUSTOM_BUILT
    solutionId: string;
    parentVersionId?: string;
    content: Buffer;
    originType: OriginType;
    changeSummary?: string;
    createdBy?: string;
}

export class WorkflowVersionService {
    /**
     * Creates a new DRAFT version of a workflow.
     */
    async createVersion(req: VersionRequest): Promise<{ versionId: string; versionNumber: number }> {
        console.log(`[VERSION_SERVICE] Creating version for solution ${req.solutionId}...`);

        // 1. Handle Artifact persistence
        const { artifactId, hash } = await artifactService.saveArtifact(req.content, req.workflowSourceId, false);

        // 2. Determine version number
        const lastVersion = await db.workflow_versions.findFirst({
            where: {
                solution_id: req.solutionId,
                workflow_source_id: req.workflowSourceId || undefined
            },
            orderBy: { version_number: 'desc' }
        });

        const versionNumber = (lastVersion?.version_number || 0) + 1;

        // 3. Check for duplicate content if it's a new version from the same parent
        if (req.parentVersionId) {
            const duplicate = await db.workflow_versions.findFirst({
                where: {
                    parent_version_id: req.parentVersionId,
                    content_hash: hash
                }
            });
            if (duplicate) {
                console.log(`[VERSION_SERVICE] Content identical to parent's child. Returning existing version ${duplicate.id}`);
                return { versionId: duplicate.id, versionNumber: duplicate.version_number };
            }
        }

        // 4. Create version record
        const version = await db.workflow_versions.create({
            data: {
                workflow_source_id: req.workflowSourceId,
                solution_id: req.solutionId,
                parent_version_id: req.parentVersionId,
                version_number: versionNumber,
                artifact_id: artifactId,
                content_hash: hash,
                status: VersionStatus.DRAFT,
                origin_type: req.originType,
                change_summary: req.changeSummary,
                created_by: req.createdBy,
                is_immutable: false
            }
        });

        await auditLogger.log({
            action: 'WORKFLOW_VERSION_CREATED',
            entityType: 'WorkflowVersion',
            entityId: version.id,
            details: { versionNumber, originType: req.originType, hash }
        });

        return { versionId: version.id, versionNumber: version.number };
    }

    /**
     * Finalizes a version, making it immutable.
     */
    async finalizeVersion(versionId: string): Promise<void> {
        const version = await db.workflow_versions.findUnique({ where: { id: versionId } });
        if (!version) throw new Error('Version not found');
        if (version.status === VersionStatus.FINALIZED) return;

        // 1. Integrity Check: Verify artifact still matches stored hash
        const artifact = await artifactService.getArtifactContent(version.artifact_id);
        const currentHash = hashService.hashBuffer(artifact);

        if (currentHash !== version.content_hash) {
            await auditLogger.log({
                action: 'WORKFLOW_HASH_MISMATCH',
                entityType: 'WorkflowVersion',
                entityId: versionId,
                details: { expected: version.content_hash, actual: currentHash }
            });
            throw new Error('Integrity check failed: Artifact content has changed.');
        }

        // 2. Finalize
        await db.workflow_versions.update({
            where: { id: versionId },
            data: {
                status: VersionStatus.FINALIZED,
                is_immutable: true
            }
        });

        await auditLogger.log({
            action: 'WORKFLOW_VERSION_FINALIZED',
            entityType: 'WorkflowVersion',
            entityId: versionId,
            details: { hash: version.content_hash }
        });
    }

    /**
     * Retrieves the full version chain for a workflow.
     */
    async getVersionChain(versionId: string): Promise<any[]> {
        const chain: any[] = [];
        let currentId: string | null = versionId;

        while (currentId) {
            const version = await db.workflow_versions.findUnique({ where: { id: currentId } });
            if (!version) break;
            chain.push(version);
            currentId = version.parent_version_id;
        }

        return chain.reverse(); // From root to leaf
    }

    /**
     * Supersedes a version (marks it as no longer current).
     */
    async supersedeVersion(versionId: string, newVersionId: string): Promise<void> {
        await db.workflow_versions.update({
            where: { id: versionId },
            data: { status: VersionStatus.SUPERSEDED }
        });

        await auditLogger.log({
            action: 'WORKFLOW_VERSION_SUPERSEDED',
            entityType: 'WorkflowVersion',
            entityId: versionId,
            details: { supersededBy: newVersionId }
        });
    }
}

export const workflowVersionService = new WorkflowVersionService();
