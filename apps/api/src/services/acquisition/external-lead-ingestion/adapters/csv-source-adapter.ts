import fs from "fs";
import type {
    ExternalSourceMetadata,
    ExternalSourceReader,
    ExternalSourceRow,
} from "./external-source-reader";

function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index++) {
        const char = line[index];

        if (char === '"') {
            if (insideQuotes && line[index + 1] === '"') {
                current += '"';
                index++;
                continue;
            }

            insideQuotes = !insideQuotes;
            continue;
        }

        if (char === "," && !insideQuotes) {
            values.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    values.push(current);

    return values;
}

function parseCsv(content: string): ExternalSourceRow[] {
    const lines = content
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(line => line.trim().length > 0);

    if (lines.length < 2) {
        return [];
    }

    const headers = parseCsvLine(lines[0]).map(header =>
        header.trim(),
    );

    return lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line);

        const payload: Record<string, unknown> = {};

        for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
            const header = headers[columnIndex];

            if (!header) {
                continue;
            }

            payload[header] =
                values[columnIndex] !== undefined
                    ? values[columnIndex]
                    : null;
        }

        return {
            rowIndex: index + 2,
            payload,
        };
    });
}

export class CsvSourceAdapter implements ExternalSourceReader {
    readonly metadata: ExternalSourceMetadata = {
        source: "FILE",
        provider: "LOCAL_FILE",
        format: "CSV",
    };

    readSample(
        filePath: string,
        limit: number = 10,
    ): ExternalSourceRow[] {
        return parseCsv(
            fs.readFileSync(filePath, "utf8"),
        ).slice(0, limit);
    }

    readAll(filePath: string): ExternalSourceRow[] {
        return parseCsv(
            fs.readFileSync(filePath, "utf8"),
        );
    }
}

export const csvSourceAdapter = new CsvSourceAdapter();
