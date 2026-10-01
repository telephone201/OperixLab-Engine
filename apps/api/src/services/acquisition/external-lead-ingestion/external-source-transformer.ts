export interface ExternalTransformContext {
    sourceType?: string;
    country?: string | null;
}

export interface ExternalTransformedRow {
    sourceRowIndex: number;
    fields: Record<string, unknown>;
    rawPayload: Record<string, unknown> | null;
    warnings: string[];
    requiresReview: boolean;
}

export interface ExternalSourceTransformer {
    supports(sourceType: string): boolean;

    transform(
        rows: Array<{
            rowIndex: number;
            values: unknown[];
        }>,
        profile: {
            sourceType: string;
            mappings: Array<{
                sourceColumn: string;
                targetField: string;
            }>;
            columns: string[];
        },
        context?: ExternalTransformContext,
    ): ExternalTransformedRow[];
}
