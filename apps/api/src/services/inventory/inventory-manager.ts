import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface WorkflowFileInfo {
    filePath: string;
    fileName: string;
    hash: string;
    size: number;
    isValidJson: boolean;
    nodeCount: number;
    workflowName?: string;
}

export class WorkflowInventoryManager {
    private sourcePath = 'D:/OperixLabs Engine/workflow-library/source';

    async scan(): Promise<WorkflowFileInfo[]> {
        const files = await this.getFilesRecursive(this.sourcePath);
        const inventory: WorkflowFileInfo[] = [];

        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf8');
                const hash = crypto.createHash('sha256').update(content).digest('hex');
                const stats = await fs.stat(file);
                
                let isValidJson = false;
                let nodeCount = 0;
                let workflowName = '';

                try {
                    const json = JSON.parse(content);
                    isValidJson = true;
                    nodeCount = json.nodes?.length || 0;
                    workflowName = json.name || path.basename(file, '.json');
                } catch (e) {
                    isValidJson = false;
                }

                inventory.push({
                    filePath: file,
                    fileName: path.basename(file),
                    hash,
                    size: stats.size,
                    isValidJson,
                    nodeCount,
                    workflowName
                });
            } catch (e) {
                console.error(`Error processing file ${file}:`, e);
            }
        }

        return inventory;
    }

    private async getFilesRecursive(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map(async (entry) => {
            const res = path.resolve(dir, entry.name);
            return entry.isDirectory() ? this.getFilesRecursive(res) : (entry.name.endsWith('.json') ? res : []);
        }));
        return files.flat();
    }
}

export const inventoryManager = new WorkflowInventoryManager();

