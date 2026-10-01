import * as XLSX from "xlsx";

export interface ExcelRawRow {
    rowIndex: number;
    values: unknown[];
}

export interface ExcelRawReadResult {
    sheetName: string;
    rows: ExcelRawRow[];
}

export class ExcelRawMatrixReader {
    readSample(
        filePath: string,
        limit: number = 20,
    ): ExcelRawReadResult {
        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: false,
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return {
                sheetName: "",
                rows: [],
            };
        }

        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return {
                sheetName,
                rows: [],
            };
        }

        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: null,
            raw: false,
        });

        return {
            sheetName,
            rows: matrix
                .slice(0, limit)
                .map((values, index) => ({
                    rowIndex: index + 1,
                    values,
                })),
        };
    }

    readAll(filePath: string): ExcelRawReadResult {
        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: false,
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return {
                sheetName: "",
                rows: [],
            };
        }

        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return {
                sheetName,
                rows: [],
            };
        }

        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: null,
            raw: false,
        });

        return {
            sheetName,
            rows: matrix.map((values, index) => ({
                rowIndex: index + 1,
                values,
            })),
        };
    }
}

export const excelRawMatrixReader = new ExcelRawMatrixReader();
