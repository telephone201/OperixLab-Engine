/**
 * @file workflow-source-resolver.ts
 * @description Resolves workflow source files by their immutable SHA-256 identity.
 */

import fs from 'fs/promises';
import path from 'path';
import { hashService } from '../versioning/hash-service';

export interface WorkflowSource {
    hash: string;
    filePath: string;
    fileName: string;
}

export class WorkflowSourceResolver {
    private readonly sourcePath = 'D:/OperixLabs Engine/workflow-library/source';
    private index: Map<string, WorkflowSource[]> | null = null;

    async resolveByHash(hash: string): Promise<WorkflowSource | null> {
        const normalizedHash = hash.trim().toLowerCase();

        if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
            throw new Error(`Invalid workflow hash: ${hash}`);
        }

        await this.ensureIndex();

        return this.index?.get(normalizedHash)?.[0] ?? null;
    }

    async resolveAllByHash(hash: string): Promise<WorkflowSource[]> {
        const normalizedHash = hash.trim().toLowerCase();

        if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
            throw new Error(`Invalid workflow hash: ${hash}`);
        }

        await this.ensureIndex();

        return this.index?.get(normalizedHash) ?? [];
    }

    async rebuildIndex(): Promise<void> {
        const files = await this.getFilesRecursive(this.sourcePath);
        const nextIndex = new Map<string, WorkflowSource[]>();

        for (const filePath of files) {
            const hash = (await hashService.hashFile(filePath)).toLowerCase();

            const source: WorkflowSource = {
                hash,
                filePath,
                fileName: path.basename(filePath)
            };

            const existing = nextIndex.get(hash);

            if (existing) {
                existing.push(source);
            } else {
                nextIndex.set(hash, [source]);
            }
        }

        this.index = nextIndex;
    }

    private async ensureIndex(): Promise<void> {
        if (!this.index) {
            await this.rebuildIndex();
        }
    }

    private async getFilesRecursive(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const fullPath = path.resolve(dir, entry.name);

            if (entry.isDirectory()) {
                files.push(...await this.getFilesRecursive(fullPath));
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                files.push(fullPath);
            }
        }

        return files;
    }
}

export const workflowSourceResolver = new WorkflowSourceResolver();
