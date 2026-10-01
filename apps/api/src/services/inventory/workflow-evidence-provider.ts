import fs from 'fs/promises';
import { db } from '../../lib/db';
import { workflowSourceResolver } from './workflow-source-resolver';
import { workflowEvidenceExtractor, WorkflowEvidence } from './workflow-evidence-extractor';

export interface WorkflowEvidenceContext {
    workflowLibraryId: string;
    workflowId: string;
    sourceHash: string;
    sourceFile: string;
    evidence: WorkflowEvidence;
}

export class WorkflowEvidenceProvider {
    async getByWorkflowLibraryId(workflowLibraryId: string): Promise<WorkflowEvidenceContext | null> {
        const result = await db.query(
            `SELECT "id", "workflow_id", "source_hash", "source_file"
             FROM "workflow_library"
             WHERE "id" = $1
             LIMIT 1`,
            [workflowLibraryId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];

        if (
            typeof row.source_hash !== 'string' ||
            !/^[a-f0-9]{64}$/.test(row.source_hash)
        ) {
            throw new Error(`Invalid source_hash for workflow ${workflowLibraryId}`);
        }

        const source = await workflowSourceResolver.resolveByHash(row.source_hash);

        if (!source) {
            throw new Error(`Workflow source not found for hash ${row.source_hash}`);
        }

        const content = await fs.readFile(source.filePath, 'utf8');
        const workflowJson = JSON.parse(content);
        const evidence = workflowEvidenceExtractor.extract(workflowJson);

        return {
            workflowLibraryId: String(row.id),
            workflowId: String(row.workflow_id),
            sourceHash: row.source_hash,
            sourceFile: source.filePath,
            evidence
        };
    }
}

export const workflowEvidenceProvider = new WorkflowEvidenceProvider();
