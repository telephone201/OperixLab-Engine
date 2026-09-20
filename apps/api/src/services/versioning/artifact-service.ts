/**
 * @file artifact-service.ts
 * @description Manages the storage and retrieval of workflow artifacts.
 *
 * Absolute Rule: Client artifacts MUST NOT be stored in the source directory.
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '../../lib/db';
import { hashService } from './hash-service';

export interface ArtifactMetadata {
    content_hash: string;
    content_size: number;
    content_format: string;
    is_immutable: boolean;
}

export class ArtifactService {
    private artifactsRoot = 'D:\\OperixLabs Engine\\workflow-library\\artifacts';

    async ensureArtifactsDir() {
        try {
            await fs.mkdir(this.artifactsRoot, { recursive: true });
        } catch (e) {
            console.error('[ARTIFACT_SERVICE] Failed to ensure artifacts directory:', e);
            throw e;
        }
    }

    /**
     * Saves a workflow artifact to the filesystem and records it in the database.
     */
    async saveArtifact(
        content: Buffer,
        sourceWorkflowId?: string,
        isImmutable = false
    ): Promise<{ artifactId: string; hash: string }> {
        await this.ensureArtifactsDir();

        const hash = hashService.hashBuffer(content);
        const size = content.length;

        // Use hash as part of the filename to prevent duplicates and ensure integrity
        const fileName = `${hash}.json`;
        const storagePath = path.join(this.artifactsRoot, fileName);

        // Check if artifact already exists to avoid duplication
        const existing = await db.workflow_artifacts.findFirst({
            where: { content_hash: hash }
        });

        if (existing) {
            return { artifactId: existing.id, hash };
        }

        // Write raw bytes to avoid JSON serialization drift
        await fs.writeFile(storagePath, content);

        const artifact = await db.workflow_artifacts.create({
            data: {
                content_hash: hash,
                content_size: size,
                storage_path: storagePath,
                is_immutable: isImmutable,
                content_format: 'json'
            }
        });

        return { artifactId: artifact.id, hash };
    }

    /**
     * Retrieves the raw bytes of an artifact.
     */
    async getArtifactContent(artifactId: string): Promise<Buffer> {
        const artifact = await db.workflow_artifacts.findUnique({
            where: { id: artifactId }
        });

        if (!artifact) throw new Error(`Artifact ${artifactId} not found`);

        return fs.readFile(artifact.storage_path);
    }

    /**
     * Verifies the integrity of an artifact on disk.
     */
    async verifyIntegrity(artifactId: string): Promise<boolean> {
        const artifact = await db.workflow_artifacts.findUnique({
            where: { id: artifactId }
        });
        if (!artifact) return false;

        const content = await fs.readFile(artifact.storage_path);
        return hashService.verifyHash(content, artifact.content_hash);
    }
}

export const artifactService = new ArtifactService();

