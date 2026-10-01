import type {
    ExternalSourceTransformer,
    ExternalTransformContext,
    ExternalTransformedRow,
} from "./external-source-transformer";

type Mapping = {
    sourceColumn: string;
    targetField: string;
};

type Profile = {
    sourceType: string;
    headerRowIndex: number | null;
    dataStartRowIndex: number;
    mappings: Mapping[];
    columns: string[];
};

type RawRow = {
    rowIndex: number;
    values: unknown[];
};

function clean(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();

    return text || null;
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
}

function splitCompositeWork(value: string): {
    companyName: string | null;
    contactTitle: string | null;
} {
    const separatorIndex = value.indexOf("@");

    if (separatorIndex <= 0) {
        return {
            companyName: null,
            contactTitle: value.trim() || null,
        };
    }

    return {
        companyName: value.slice(0, separatorIndex).trim() || null,
        contactTitle: value.slice(separatorIndex + 1).trim() || null,
    };
}

function expandEmails(value: string): string[] {
    return value
        .split(/[,\n;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .filter(isEmail);
}

export class DefaultExternalSourceTransformer
    implements ExternalSourceTransformer
{
    supports(sourceType: string): boolean {
        return [
            "BUSINESS_DATABASE",
            "CONTACT_DATABASE",
            "EMAIL_LIST",
            "HEADERLESS_OR_MALFORMED",
            "STRUCTURED_DATA_EMBEDDED_HEADER",
            "POSSIBLE_BUSINESS_DATABASE",
            "MIXED_OR_MULTI_SECTION",
            "UNKNOWN",
        ].includes(sourceType);
    }

    transform(
        rows: RawRow[],
        profile: Profile,
        context: ExternalTransformContext = {},
    ): ExternalTransformedRow[] {
        const columnIndex = new Map(
            profile.columns.map((column, index) => [column, index]),
        );

        const mappingByColumn = new Map(
            profile.mappings.map((mapping) => [
                mapping.sourceColumn,
                mapping.targetField,
            ]),
        );

        /*
         * Mixed / multi-section sources must never be destructively
         * transformed. Rows are passed through with mapped fields
         * suppressed and review forced on every row; the raw payload
         * is preserved for later section splitting.
         */
        if (profile.sourceType === "MIXED_OR_MULTI_SECTION") {
            return rows
                .filter(row =>
                    row.values.some(value => clean(value) !== null),
                )
                .map(row => ({
                    sourceRowIndex: row.rowIndex,
                    fields: {},
                    rawPayload: Object.fromEntries(
                        profile.columns.map((column, index) => [
                            column,
                            row.values[index] ?? null,
                        ]),
                    ),
                    warnings: [
                        "Mixed / multi-section source: row skipped pending section splitting review.",
                    ],
                    requiresReview: true,
                }));
        }

        const dataStartRowNumber = profile.dataStartRowIndex + 1;

        const dataRows = rows.filter(
            (row) =>
                row.rowIndex >= dataStartRowNumber &&
                row.values.some((value) => clean(value) !== null),
        );

        const output: ExternalTransformedRow[] = [];

        for (const row of dataRows) {
            const fields: Record<string, unknown> = {};
            const warnings: string[] = [];
            let requiresReview =
                profile.sourceType === "HEADERLESS_OR_MALFORMED";

            for (const column of profile.columns) {
                const index = columnIndex.get(column);

                if (index === undefined) continue;

                const rawValue = clean(row.values[index]);

                if (!rawValue) continue;

                const targetField = mappingByColumn.get(column);

                if (!targetField || targetField === "ignore") continue;

                if (
                    profile.sourceType === "EMAIL_LIST" &&
                    targetField === "contactEmail"
                ) {
                    const emails = expandEmails(rawValue);

                    if (emails.length === 0) {
                        warnings.push(
                            `Could not extract email values from ${column}`,
                        );
                        requiresReview = true;
                        continue;
                    }

                    fields.contactEmails = [
                        ...((fields.contactEmails as string[]) ?? []),
                        ...emails,
                    ];

                    continue;
                }

                if (
                    profile.sourceType === "CONTACT_DATABASE" &&
                    targetField === "contactTitle" &&
                    rawValue.includes("@")
                ) {
                    const composite = splitCompositeWork(rawValue);

                    if (composite.companyName) {
                        fields.companyName = composite.companyName;
                    }

                    if (composite.contactTitle) {
                        fields.contactTitle = composite.contactTitle;
                    }

                    continue;
                }

                fields[targetField] = rawValue;
            }

            /*
             * Detect obvious semantic column mismatch.
             *
             * Example:
             * Header says:
             *   email | company
             *
             * Actual row:
             *   Company Name | email@example.com
             *
             * Do not silently import the swapped values.
             */
            if (
                profile.sourceType === "BUSINESS_DATABASE" &&
                typeof fields.contactEmail === "string" &&
                typeof fields.companyName === "string" &&
                isEmail(fields.companyName) &&
                !isEmail(fields.contactEmail)
            ) {
                const originalEmail = fields.contactEmail;
                const originalCompany = fields.companyName;

                fields.contactEmail = originalCompany;
                fields.companyName = originalEmail;

                warnings.push(
                    "Detected likely company/email column mismatch and corrected values by semantic type.",
                );

                requiresReview = true;
            }

            if (fields.contactEmails) {
                fields.contactEmails = Array.from(
                    new Set(fields.contactEmails as string[]),
                );
            }

            if (
                profile.sourceType === "EMAIL_LIST" &&
                !Array.isArray(fields.contactEmails)
            ) {
                warnings.push("No email values extracted");
                requiresReview = true;
            }

            if (context.country) {
                fields.country = context.country;
            }

            output.push({
                sourceRowIndex: row.rowIndex,
                fields,
                rawPayload: Object.fromEntries(
                    profile.columns.map((column, index) => [
                        column,
                        row.values[index] ?? null,
                    ]),
                ),
                warnings,
                requiresReview,
            });
        }

        return output;
    }
}

export const defaultExternalSourceTransformer =
    new DefaultExternalSourceTransformer();

