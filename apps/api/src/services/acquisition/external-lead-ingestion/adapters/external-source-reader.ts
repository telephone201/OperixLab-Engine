export interface ExternalSourceMetadata {
    source: string;
    provider: string;
    format: string;
    country?: string | null;
    metadata?: Record<string, unknown>;
}

export interface ExternalSourceRow {
    rowIndex: number;
    payload: Record<string, unknown>;
}

export interface ExternalSourceReader {
    readonly metadata: ExternalSourceMetadata;

    readSample(
        filePath: string,
        limit?: number,
    ): ExternalSourceRow[];

    readAll(
        filePath: string,
    ): ExternalSourceRow[];
}
