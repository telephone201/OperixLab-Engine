/**
 * @file csv-importer.ts
 * @description Robust CSV import service with column mapping.
 */

import fs from 'fs/promises';
import { RawRecord } from '../types/acquisition-types';

export interface ColumnMapping {
    [key: string]: string; // { "SourceColumn": "TargetField" }
}

export interface ImportResult {
    successCount: number;
    failedCount: number;
    duplicates: number;
    errors: Array<{ row: number; error: string }>;
}

export class CSVImporter {
    async parseCSV(filePath: string, mapping: ColumnMapping): Promise<RawRecord[]> {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const records: RawRecord[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const record: any = {
                source: 'CSV',
                provider: 'CSVImporter',
                rawMetadata: { row: i }
            };

            for (const [srcCol, targetField] of Object.entries(mapping)) {
                const colIndex = headers.indexOf(srcCol);
                if (colIndex !== -1 && values[colIndex]) {
                    record[targetField] = values[colIndex].trim();
                }
            }

            // Ensure a company name exists
            if (record.companyName) {
                records.push(record as RawRecord);
            }
        }

        return records;
    }
}

export const csvImporter = new CSVImporter();
