/**
 * @file workflow-library-importer.ts
 * @description One-time utility to import the Phase 2 index.json into the workflow_library table.
 */

import fs from 'fs';
import path from 'path';
import { db } from '../../lib/db'; // Adjust based on actual DB client path

export class WorkflowLibraryImporter {
    private indexFilePath = 'D:\\OperixLabs Engine\\workflow-library\\index.json';

    async importIndex(): Promise<{ imported: number; errors: number }> {
        console.log('[IMPORTER] Starting import of workflow library index...');

        try {
            const rawData = fs.readFileSync(this.indexFilePath, 'utf8');
            const workflows = JSON.parse(rawData);
            let importedCount = 0;
            let errorCount = 0;

            for (const wf of workflows) {
                try {
                    // Use an upsert to prevent duplicates if run multiple times
                    await db.workflow_library.upsert({
                        where: { workflow_id: wf.workflow_id },
                        update: {
                            name: wf.name,
                            description: wf.description,
                            category: wf.category,
                            integrations: wf.integrations.split(','),
                            triggers: wf.triggers.split(','),
                            complexity: wf.complexity,
                            quality_score: wf.quality_score,
                            source_hash: wf.source_hash,
                            source_file: wf.source_file,
                        },
                        create: {
                            workflow_id: wf.workflow_id,
                            name: wf.name,
                            description: wf.description,
                            category: wf.category,
                            integrations: wf.integrations.split(','),
                            triggers: wf.triggers.split(','),
                            complexity: wf.complexity,
                            quality_score: wf.quality_score,
                            source_hash: wf.source_hash,
                            source_file: wf.source_file,
                        }
                    });
                    importedCount++;
                } catch (e) {
                    console.error(`[IMPORTER] Failed to import workflow ${wf.workflow_id}:`, e);
                    errorCount++;
                }
            }

            console.log(`[IMPORTER] Import complete. Success: ${importedCount}, Errors: ${errorCount}`);
            return { imported: importedCount, errors: errorCount };
        } catch (e) {
            console.error('[IMPORTER] Critical failure during index import:', e);
            throw e;
        }
    }
}

