import type {
    ExternalField,
    SourceSchemaProfile,
} from "./source-schema-profile";
import type { NormalizedExternalLead } from "./external-lead-normalizer";
import {
    RawSourceSchemaProfiler,
    countNonEmpty,
    detectMixedSections,
    isEmail,
} from "./raw-source-schema-profiler";
import {
    splitRawSourceSections,
} from "./raw-source-section-splitter";

/**
 * @file mapping-preview-service.ts
 * @description Pure, read-only Mapping Preview Layer.
 *
 * Converts EXISTING schema profiles (RawSourceSchemaProfiler) and EXISTING
 * structural section splits (raw-source-section-splitter) into a per-column
 * preview:
 *
 *   SOURCE COLUMN -> PROPOSED CANONICAL FIELD -> CONFIDENCE -> SAMPLES
 *
 * Hard rules:
 *   - A proposed field exists ONLY where the existing profiler proved a
 *     mapping (explicit header match or deterministic value-type inference).
 *     The preview never invents its own detection rules.
 *   - proposedField is null when no reliable mapping exists; such columns
 *     are reviewRequired=true (except explicit profiler "ignore" metadata).
 *   - No company/contact semantics are inferred from file names, from
 *     structural position alone, or from column index. No country-specific
 *     rules and no hardcoded row numbers.
 *   - Alternating single-value sections stay conservative: an email proposal
 *     survives only when the column's values are demonstrably email-dominant
 *     (same >= 0.70 ratio threshold the profiler itself uses); mixed
 *     single columns stay unmapped with per-value review.
 *   - Everything here is pure: no I/O, no mutation of inputs, no DB, no
 *     normalization persistence, no import. Deterministic output.
 */

export type MappingConfidenceLevel =
    | "HIGH"
    | "MEDIUM"
    | "LOW"
    | "UNMAPPED";

export type MappingReviewStatus = "SAFE" | "REVIEW_REQUIRED";

/**
 * Canonical ingestion-domain field names (snake_case presentation form).
 * Every entry maps 1:1 to an existing profiler target field and to an
 * existing property of NormalizedExternalLead; nothing outside the
 * current ingestion domain is introduced.
 */
export const CANONICAL_FIELD_BY_PROFILER_FIELD: Record<
    ExternalField,
    string | null
> = {
    companyName: "company_name",
    contactName: "contact_name",
    firstName: "first_name",
    lastName: "last_name",
    contactEmail: "email",
    phone: "phone",
    contactTitle: "title",
    address: "address",
    city: "city",
    country: "country",
    industry: "industry",
    website: "website",
    sourceUrl: "source_url",
    location: "location",
    externalId: "source_external_id",
    ignore: null, // explicit metadata column; safe to drop, not a field
};

/** NormalizedExternalLead property each canonical field maps to. */
const NORMALIZER_PROPERTY_BY_PROFILER_FIELD: Record<
    ExternalField,
    keyof NormalizedExternalLead | null
> = {
    companyName: "companyName",
    contactName: "contactName",
    firstName: null, // composed into contactName downstream
    lastName: null, // composed into contactName downstream
    contactEmail: "contactEmail",
    phone: "phone",
    contactTitle: "contactTitle",
    address: "address",
    city: "city",
    country: "country",
    industry: "industry",
    website: "website",
    sourceUrl: "sourceUrl",
    location: null, // presentation-only location field
    externalId: "sourceExternalId",
    ignore: null,
};

const HIGH_CONFIDENCE_THRESHOLD = 0.9;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Value-purity threshold for proposing "email" on an alternating
 * section column. Deliberately identical to the profiler's own
 * deterministic email-ratio inference threshold.
 */
const EMAIL_PURITY_THRESHOLD = 0.7;

const MAX_SAMPLE_VALUES = 4;

export interface MappingPreviewColumn {
    /** Physical column in the section (header text or column_N). */
    sourceColumn: string;

    /** Canonical field proposal; null when no reliable mapping exists. */
    proposedField: string | null;

    /** Original profiler target field the proposal derives from. */
    profilerField: ExternalField | null;

    /** Numeric confidence from the existing profiler; null when unmapped. */
    confidence: number | null;

    confidenceLevel: MappingConfidenceLevel;

    /** Up to MAX_SAMPLE_VALUES deduplicated real values from the section. */
    sampleValues: string[];

    /** Why this proposal (or non-proposal) exists. */
    mappingReason: string;

    /**
     * Non-null when the profiler's header-based claim contradicts the
     * column's actual value classes (e.g. an "email" header whose values
     * are mostly company names). The proposal is kept for review, never
     * silently remapped.
     */
    mappingConflict: string | null;

    reviewRequired: boolean;

    reviewStatus: MappingReviewStatus;
}

export interface MappingSectionPreview {
    sectionIndex: number;
    startRowIndex: number;
    endRowIndex: number;
    structuralPattern: string;
    sectionType: string;
    nonEmptyRowCount: number;
    malformedRecordCount: number;
    sectionTitleRowCount: number;
    sectionReviewRequired: boolean;
    columns: MappingPreviewColumn[];
    mappedColumnCount: number;
    unmappedColumnCount: number;
    notes: string[];
}

export interface MappingPreview {
    fileName: string | null;
    overallSourceType: string;
    overallRequiresReview: boolean;
    isMixed: boolean;
    rowCount: number;
    /** Present when analysis was capped via maxRows. */
    truncatedToRows: number | null;
    sections: MappingSectionPreview[];
}

function confidenceLevelOf(
    confidence: number | null,
): MappingConfidenceLevel {
    if (confidence === null) {
        return "UNMAPPED";
    }

    if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        return "HIGH";
    }

    if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
        return "MEDIUM";
    }

    return "LOW";
}

function cleanValue(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value)
        .replace(/\uFEFF/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return text.length > 0 ? text : null;
}

function physicalColumnIndex(
    sourceColumn: string,
    columns: string[],
): number | null {
    const explicitMatch = /^column_(\d+)$/.exec(sourceColumn);

    if (explicitMatch) {
        const index = Number(explicitMatch[1]) - 1;

        return index >= 0 ? index : null;
    }

    const index = columns.indexOf(sourceColumn);

    return index >= 0 ? index : null;
}

/**
 * Deterministic, deduplicated sample values for one physical column of a
 * section. Header rows are excluded when the profile proves one.
 */
function collectSampleValues(
    sectionRows: Array<{ rowIndex: number; values: unknown[] }>,
    columnIndex: number,
    options: { firstDataRowIndex?: number } = {},
): string[] {
    const seen = new Set<string>();
    const samples: string[] = [];

    for (const row of sectionRows) {
        if (
            options.firstDataRowIndex !== undefined &&
            row.rowIndex <= options.firstDataRowIndex
        ) {
            continue;
        }

        if (countNonEmpty(row.values) === 0) {
            continue;
        }

        const value = cleanValue(row.values[columnIndex]);

        if (value === null) {
            continue;
        }

        const dedupeKey = value.toLowerCase();

        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        samples.push(value.length > 80 ? `${value.slice(0, 77)}...` : value);

        if (samples.length >= MAX_SAMPLE_VALUES) {
            break;
        }
    }

    return samples;
}

/**
 * Collect ALL data values of one physical column (header row excluded
 * when the profile proves one). Used by the header/data consistency
 * check with the same email primitive the profiler itself uses.
 */
function collectAllColumnValues(
    sectionRows: Array<{ rowIndex: number; values: unknown[] }>,
    columnIndex: number,
    firstDataRowIndex?: number,
): string[] {
    return sectionRows
        .filter(
            row =>
                countNonEmpty(row.values) > 0 &&
                (firstDataRowIndex === undefined ||
                    row.rowIndex > firstDataRowIndex),
        )
        .map(row => cleanValue(row.values[columnIndex]))
        .filter((value): value is string => value !== null);
}

/**
 * Header/data consistency check for headered sources: when a header
 * asserts "email" (or "company") but the column's values do not behave
 * like emails (or are mostly emails), flag a conflict. Uses ONLY the
 * profiler's own email primitive — no new semantics are introduced, and
 * the proposal is never silently remapped; a human decides.
 */
function assessHeaderDataConsistency(
    profilerField: ExternalField,
    values: string[],
): string | null {
    if (values.length === 0) {
        return null;
    }

    const emailCount = values.filter(value =>
        isEmail(value),
    ).length;
    const emailRatio = emailCount / values.length;

    if (
        profilerField === "contactEmail" &&
        emailRatio < 0.5
    ) {
        return `Header/data conflict: header asserts email but only ${emailCount}/${values.length} values are email-like (${(emailRatio * 100).toFixed(0)}%); possible column swap or mislabeled header. Human review required before use.`;
    }

    if (
        profilerField === "companyName" &&
        emailRatio > 0.5
    ) {
        return `Header/data conflict: header asserts company name but ${emailCount}/${values.length} values look like emails (${(emailRatio * 100).toFixed(0)}%); possible column swap or mislabeled header. Human review required before use.`;
    }

    return null;
}

/**
 * Column previews derived from an EXISTING section/whole-source profile.
 * Only profiler-proven mappings become proposals; everything else is
 * unmapped and flagged for review.
 */
function buildColumnsFromProfile(
    profile: SourceSchemaProfile,
    sectionRows: Array<{ rowIndex: number; values: unknown[] }>,
    options: {
        sectionReviewRequired: boolean;
        isAlternatingSection: boolean;
    },
): MappingPreviewColumn[] {
    const mappingByColumn = new Map(
        profile.mappings.map(mapping => [
            mapping.sourceColumn,
            mapping,
        ]),
    );

    const firstDataRowIndex = options.isAlternatingSection
        ? undefined
        : profile.headerRowIndex !== null
            ? profile.dataStartRowIndex
            : undefined;

    return profile.columns.map(sourceColumn => {
        const mapping = mappingByColumn.get(sourceColumn);
        const profilerField = mapping?.targetField ?? null;
        const canonicalField =
            profilerField !== null
                ? CANONICAL_FIELD_BY_PROFILER_FIELD[
                        profilerField
                    ] ?? null
                : null;
        const normalizerProperty =
            profilerField !== null
                ? NORMALIZER_PROPERTY_BY_PROFILER_FIELD[
                        profilerField
                    ] ?? null
                : null;
        const isMetadataDrop =
            profilerField === "ignore";

        const columnIndex = physicalColumnIndex(
            sourceColumn,
            profile.columns,
        );

        const sampleValues =
            columnIndex === null
                ? []
                : collectSampleValues(sectionRows, columnIndex, {
                        firstDataRowIndex,
                    });

        /*
         * Header/data consistency (headered sources only): verify the
         * profiler's header-based claim against actual value classes.
         * A conflict keeps the proposal (never silently remapped) but
         * forces review — the samples below make the mismatch visible.
         */
        const mappingConflict =
            columnIndex === null ||
            firstDataRowIndex === undefined ||
            profilerField === null
                ? null
                : assessHeaderDataConsistency(
                        profilerField,
                        collectAllColumnValues(
                            sectionRows,
                            columnIndex,
                            firstDataRowIndex,
                        ),
                    );

        /*
         * Alternating-section conservatism: the splitter maps the single
         * value column to email structurally; the preview only lets that
         * survive when the column's values are demonstrably email-dominant
         * (same ratio rule the profiler uses). Mixed single columns stay
         * unmapped and require per-value review.
         */
        let valueClassNote = "";

        if (
            options.isAlternatingSection &&
            profilerField !== null &&
            columnIndex !== null
        ) {
            const values = sectionRows
                .filter(row => countNonEmpty(row.values) > 0)
                .map(row => cleanValue(row.values[columnIndex]))
                .filter(
                    (value): value is string => value !== null,
                );

            const emailCount = values.filter(value =>
                isEmail(value),
            ).length;
            const emailRatio =
                values.length > 0
                    ? emailCount / values.length
                    : 0;

            valueClassNote = `value classes: ${emailCount} email-like, ${values.length - emailCount} other (ratio ${emailRatio.toFixed(2)}).`;

            if (emailRatio < EMAIL_PURITY_THRESHOLD) {
                return {
                    sourceColumn,
                    proposedField: null,
                    profilerField,
                    confidence: null,
                    confidenceLevel: "UNMAPPED",
                    sampleValues,
                    mappingReason: `Alternating single-value column carries mixed value classes; ${valueClassNote} per-value separation (email vs company/contact) requires human review.`,
                    mappingConflict: null,
                    reviewRequired: true,
                    reviewStatus: "REVIEW_REQUIRED",
                };
            }
        }

        if (canonicalField === null && isMetadataDrop) {
            return {
                sourceColumn,
                proposedField: null,
                profilerField,
                confidence: mapping?.confidence ?? null,
                confidenceLevel: confidenceLevelOf(
                    mapping?.confidence ?? null,
                ),
                sampleValues,
                mappingReason: `${mapping?.reason ?? "Profiler classified this column as metadata"}; safe to drop (no ingestion field).`,
                mappingConflict,
                reviewRequired:
                    options.sectionReviewRequired,
                reviewStatus:
                    options.sectionReviewRequired
                        ? "REVIEW_REQUIRED"
                        : "SAFE",
            };
        }

        if (canonicalField === null || mapping === undefined) {
            return {
                sourceColumn,
                proposedField: null,
                profilerField,
                confidence: mapping?.confidence ?? null,
                confidenceLevel: "UNMAPPED",
                sampleValues,
                mappingReason:
                    mapping === undefined
                        ? "No profiler-proven mapping for this column (no explicit header match and no deterministic value type); no semantic guess is made."
                        : `Profiler target field "${profilerField}" has no canonical ingestion field; treat as unmapped.`,
                mappingConflict,
                reviewRequired: true,
                reviewStatus: "REVIEW_REQUIRED",
            };
        }

        const confidenceLevel = confidenceLevelOf(
            mapping.confidence,
        );

        const reviewRequired =
            options.sectionReviewRequired ||
            confidenceLevel === "LOW" ||
            mappingConflict !== null;

        return {
            sourceColumn,
            proposedField: canonicalField,
            profilerField,
            confidence: mapping.confidence,
            confidenceLevel,
            sampleValues,
            mappingReason: `${mapping.reason}${normalizerProperty ? `; populates NormalizedExternalLead.${normalizerProperty} downstream.` : "."}`,
            mappingConflict,
            reviewRequired,
            reviewStatus: reviewRequired
                ? "REVIEW_REQUIRED"
                : "SAFE",
        };
    });
}

function buildSectionPreview(
    sectionIndex: number,
    input: {
        startRowIndex: number;
        endRowIndex: number;
        structuralPattern: string;
        nonEmptyRowCount: number;
        malformedRecordCount: number;
        sectionTitleRowCount: number;
        rows: Array<{ rowIndex: number; values: unknown[] }>;
        profile: SourceSchemaProfile | null;
    },
    fallbackType: string,
): MappingSectionPreview {
    const sectionReviewRequired =
        input.profile === null ||
        input.profile.requiresReview ||
        input.malformedRecordCount > 0 ||
        input.structuralPattern ===
            "ALTERNATING_SINGLE_VALUE";

    const columns = buildColumnsFromProfile(
        input.profile ?? {
            sourceType: "UNKNOWN",
            headerRowIndex: null,
            dataStartRowIndex: 0,
            columns: [],
            mappings: [],
            confidence: 0,
            requiresReview: true,
            notes: [],
        },
        input.rows,
        {
            sectionReviewRequired,
            isAlternatingSection:
                input.structuralPattern ===
                "ALTERNATING_SINGLE_VALUE",
        },
    );

    const notes: string[] = [];

    if (input.profile === null) {
        notes.push(
            "Section has no safe independent schema profile; all columns are unmapped and require review.",
        );
    }

    if (input.malformedRecordCount > 0) {
        notes.push(
            `${input.malformedRecordCount} malformed/incomplete record(s) in this section remain review-required regardless of column mappings.`,
        );
    }

    const mappedColumnCount = columns.filter(
        column => column.proposedField !== null,
    ).length;

    return {
        sectionIndex,
        startRowIndex: input.startRowIndex,
        endRowIndex: input.endRowIndex,
        structuralPattern: input.structuralPattern,
        sectionType:
            input.profile?.sourceType ?? fallbackType,
        nonEmptyRowCount: input.nonEmptyRowCount,
        malformedRecordCount: input.malformedRecordCount,
        sectionTitleRowCount: input.sectionTitleRowCount,
        sectionReviewRequired,
        columns,
        mappedColumnCount,
        unmappedColumnCount:
            columns.length - mappedColumnCount,
        notes,
    };
}

/**
 * Build the full mapping preview for a raw spreadsheet source.
 * Pure function: same input always yields the exact same output.
 */
export function buildMappingPreview(
    rows: Array<{ rowIndex: number; values: unknown[] }>,
    options: {
        fileName?: string | null;
        maxRows?: number | null;
    } = {},
): MappingPreview {
    const allRows = rows;
    const maxRows = options.maxRows ?? null;
    const truncated =
        maxRows !== null && maxRows > 0
            ? allRows.length > maxRows
            : false;
    const analysisRows = truncated
        ? allRows.slice(0, maxRows as number)
        : allRows;

    const overallProfile =
        new RawSourceSchemaProfiler().profile(analysisRows);
    const mixedDetection =
        detectMixedSections(analysisRows);

    let sectionPreviews: MappingSectionPreview[];

    if (!mixedDetection.isMixed) {
        sectionPreviews = [
            buildSectionPreview(
                0,
                {
                    startRowIndex: analysisRows[0]?.rowIndex ?? 0,
                    endRowIndex:
                        analysisRows[analysisRows.length - 1]
                            ?.rowIndex ?? 0,
                    structuralPattern: "SINGLE_SECTION",
                    nonEmptyRowCount: analysisRows.filter(
                        row => countNonEmpty(row.values) > 0,
                    ).length,
                    malformedRecordCount: 0,
                    sectionTitleRowCount: 0,
                    rows: analysisRows,
                    profile: overallProfile,
                },
                overallProfile.sourceType,
            ),
        ];
    } else {
        const split =
            splitRawSourceSections(analysisRows);

        sectionPreviews = split.sections.map(
            (section, index) =>
                buildSectionPreview(
                    index,
                    {
                        startRowIndex: section.startRowIndex,
                        endRowIndex: section.endRowIndex,
                        structuralPattern:
                            section.structuralPattern,
                        nonEmptyRowCount:
                            section.nonEmptyRowCount,
                        malformedRecordCount:
                            section.malformedRecordCount,
                        sectionTitleRowCount:
                            section.sectionTitleRowIndices
                                .length,
                        rows: section.rawRows,
                        profile: section.profile,
                    },
                    "REVIEW_REQUIRED",
                ),
        );
    }

    return {
        fileName: options.fileName ?? null,
        overallSourceType: overallProfile.sourceType,
        overallRequiresReview: overallProfile.requiresReview,
        isMixed: mixedDetection.isMixed,
        rowCount: allRows.length,
        truncatedToRows: truncated ? maxRows : null,
        sections: sectionPreviews,
    };
}
