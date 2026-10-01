import * as XLSX from "xlsx";
import type {
    ExternalSourceMetadata,
    ExternalSourceReader,
    ExternalSourceRow,
} from "./external-source-reader";

export class ExcelSourceAdapter implements ExternalSourceReader {
    readonly metadata: ExternalSourceMetadata = {
        source: "FILE",
        provider: "LOCAL_FILE",
        format: "XLSX",
    };

    readSample(
        filePath: string,
        limit: number = 10,
    ): ExternalSourceRow[] {
        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: false,
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return [];
        }

        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return [];
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            sheet,
            {
                defval: null,
                raw: false,
            },
        );

        return rows
            .slice(0, limit)
            .map((payload, index) => ({
                rowIndex: index + 1,
                payload,
            }));
    }

    readAll(filePath: string): ExternalSourceRow[] {
        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: false,
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return [];
        }

        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return [];
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            sheet,
            {
                defval: null,
                raw: false,
            },
        );

        return rows.map((payload, index) => ({
            rowIndex: index + 1,
            payload,
        }));
    }
}

export const excelSourceAdapter = new ExcelSourceAdapter();
