import * as XLSX from 'xlsx';

export interface ExcelReadResult {
    headers: string[];
    rows: Record<string, string | null>[];
}

export class ExcelSourceReader {
    readSample(
        filePath: string,
        limit: number = 10
    ): ExcelReadResult {

        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: false
        });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            sheet,
            {
                defval: null,
                raw: false
            }
        );

        const limited = rows.slice(0, limit);

        const headers = limited.length > 0
            ? Object.keys(limited[0])
            : [];

        return {
            headers,
            rows: limited.map(row => {
                const output: Record<string, string | null> = {};

                for (const [key, value] of Object.entries(row)) {
                    output[key] =
                        value === null || value === undefined
                            ? null
                            : String(value);
                }

                return output;
            })
        };
    }
}

export const excelSourceReader = new ExcelSourceReader();