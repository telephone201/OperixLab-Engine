import type {
    SourceSchemaProfile,
} from "./source-schema-profile";
import {
    RawSourceSchemaProfiler,
    countNonEmpty,
    detectMixedSections,
    isEmail,
} from "./raw-source-schema-profiler";

/**
 * @file raw-source-section-splitter.ts
 * @description Generic structural section splitting for raw spreadsheet
 *              sources (Excel matrix data), operating before any semantic
 *              field inference. Preserves exact original row indices and
 *              feeds each structural section independently into the
 *              existing schema profiling path where safe.
 *
 *              Structural only: no semantic fields are guessed beyond what
 *              RawSourceSchemaProfiler can safely establish. Sources whose
 *              non-empty rows all carry multiple values (a single tabular
 *              regime, including 3/4/5-value headerless patterns) are
 *              never split, and never classified as mixed merely for
 *              varying column counts. No destructive transformation and no
 *              DB/import behavior lives here.
 */

export interface RawSourceRow {
    rowIndex: number;
    values: unknown[];
}

export interface RawSourceSection {
    /** 1-based, inclusive, exact original row indices. */
    startRowIndex: number;
    endRowIndex: number;

    /** Structural pattern of the section's non-empty rows. */
    structuralPattern:
        | "TABULAR_MULTI_COLUMN"
        | "ALTERNATING_SINGLE_VALUE"
        | "SINGLE_SECTION";

    /**
     * Exact original RawSourceRow objects (same references as the input),
     * including interior blank rows for provenance. Consumers must treat
     * blank rows as separators, never lead records.
     */
    rawRows: RawSourceRow[];

    /** Number of non-empty rows in the section. */
    nonEmptyRowCount: number;

    /** Conservative section-title/metadata rows detected inside the section. */
    sectionTitleRowIndices: number[];

    /**
     * Alternating sections only: structurally well-formed value/email
     * pairs detected. Zero for other patterns.
     */
    structuredRecordCount: number;

    /**
     * Alternating sections only: records breaking the alternating rhythm
     * (missing company or email slot). Raw rows are always preserved;
     * any count > 0 forces requiresReview.
     */
    malformedRecordCount: number;

    /** Independent schema profile of the section; null when not safely profileable. */
    profile: SourceSchemaProfile | null;

    /** Structural confidence (1.0 for unsplit single-section sources). */
    confidence: number;

    requiresReview: boolean;
    notes: string[];
}

export interface RawSourceSplitResult {
    /** True when the source consists of a single structural regime. */
    isSingleSection: boolean;

    /** Sections in file order; exactly one entry when isSingleSection. */
    sections: RawSourceSection[];

    notes: string[];
}

const MIN_SECTION_NON_EMPTY_ROWS = 3;

/**
 * Maximum row distance (in row indices, blanks included) between a
 * single-value run and surrounding multi-value runs for that run to be
 * treated as a straggler (an incomplete record inside a tabular regime)
 * rather than an independent section.
 */
const MIXED_SECTION_MAX_STRAGGLER_GAP = 2;

/**
 * Structural run model (blank rows are fully transparent):
 *   - a "multi" run is a maximal sequence of multi-value rows;
 *   - a "single" run is a maximal sequence of single-value rows that may
 *     span blank separators (blank rows never break the run and are
 *     carried for provenance only); any multi-value row terminates it.
 *
 * Whether a single run is a straggler or an independent section is
 * decided later from its structural surroundings, not from its length
 * alone: an alternating regime separated by blank rows produces many
 * short single runs that must NOT be absorbed into tabular sections.
 */
interface StructuralRun {
    kind: "multi" | "single";
    startRowIndex: number;
    /** Last non-empty row of the run (trailing blanks excluded). */
    endRowIndex: number;
    nonEmptyRowCount: number;
    /** Includes interior blank rows for provenance. */
    rows: RawSourceRow[];
}

function buildStructuralRuns(
    rows: RawSourceRow[],
): StructuralRun[] {
    const runs: StructuralRun[] = [];

    for (const row of rows) {
        const nonEmpty = countNonEmpty(row.values);

        if (nonEmpty === 0) {
            const previous = runs[runs.length - 1];

            if (previous && previous.kind === "single") {
                previous.rows.push(row);
            }

            continue;
        }

        const kind =
            nonEmpty === 1 ? ("single" as const) : ("multi" as const);
        const previous = runs[runs.length - 1];

        if (previous && previous.kind === kind) {
            previous.endRowIndex = row.rowIndex;
            previous.nonEmptyRowCount += 1;
            previous.rows.push(row);

            continue;
        }

        runs.push({
            kind,
            startRowIndex: row.rowIndex,
            endRowIndex: row.rowIndex,
            nonEmptyRowCount: 1,
            rows: [row],
        });
    }

    return runs;
}

/**
 * Conservative structural-title heuristic: a single-value row that is
 * not a primitive value (email-like) AND whose normalized text is
 * repeated verbatim at least twice across the source. Repetition — not
 * wording — is the signal, so no language or file-specific assumptions
 * are made. Unique one-value rows are assumed to be data, not titles.
 */
function isStructuralTitle(
    value: string,
    normalizedValueCounts: Map<string, number>,
): boolean {
    const normalized = value
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    return (
        !isEmail(normalized) &&
        (normalizedValueCounts.get(normalized) ?? 0) >= 2
    );
}

function firstNonEmptyValue(row: RawSourceRow): string {
    return String(
        row.values.find(
            cell => String(cell ?? "").trim() !== "",
        ) ?? "",
    ).trim();
}

/**
 * Walk an alternating single-value run and count structural records
 * WITHOUT assigning semantic fields: a record is (non-email value,
 * email value); anything breaking that rhythm (title rows, consecutive
 * non-email values, bare emails) is counted as malformed but preserved.
 */
function analyzeAlternatingRun(
    run: StructuralRun,
    normalizedValueCounts: Map<string, number>,
): {
    titleRowIndices: number[];
    malformedRecordCount: number;
    structuredRecordCount: number;
} {
    const nonEmptyRows = run.rows.filter(
        row => countNonEmpty(row.values) === 1,
    );

    const titleRowIndices: number[] = [];
    let structuredRecordCount = 0;
    let malformedRecordCount = 0;
    let expectingEmail = false;

    for (const row of nonEmptyRows) {
        const value = firstNonEmptyValue(row);

        if (isStructuralTitle(value, normalizedValueCounts)) {
            titleRowIndices.push(row.rowIndex);
            expectingEmail = false;

            continue;
        }

        if (!expectingEmail) {
            if (isEmail(value)) {
                // Bare email where a company slot was expected.
                malformedRecordCount++;

                continue;
            }

            expectingEmail = true;

            continue;
        }

        // Email-slot row.
        if (isEmail(value)) {
            structuredRecordCount++;
            expectingEmail = false;
        } else {
            // Two consecutive non-email values: the first row's email
            // slot is missing.
            malformedRecordCount++;
        }
    }

    if (expectingEmail) {
        // Trailing value with no email slot.
        malformedRecordCount++;
    }

    return {
        titleRowIndices,
        malformedRecordCount,
        structuredRecordCount,
    };
}

/**
 * Profile a tabular candidate as an independent schema. Only sections
 * with enough rows and a predominantly multi-column regime are profiled;
 * anything else returns null (REVIEW_REQUIRED, raw rows preserved).
 */
function profileTabularSectionSafely(
    sectionRows: RawSourceRow[],
): SourceSchemaProfile | null {
    const nonEmptyRows = sectionRows.filter(
        row => countNonEmpty(row.values) > 0,
    );

    const multiValueRows = nonEmptyRows.filter(
        row => countNonEmpty(row.values) > 1,
    );

    if (
        nonEmptyRows.length < MIN_SECTION_NON_EMPTY_ROWS ||
        multiValueRows.length <
            Math.ceil(nonEmptyRows.length * 0.5)
    ) {
        return null;
    }

    try {
        return new RawSourceSchemaProfiler().profile(
            nonEmptyRows,
        );
    } catch {
        return null;
    }
}

/**
 * Profile an alternating single-value section as an email-bearing list.
 * Structurally safe: emails self-identify; the companion non-email
 * values are NOT semantically mapped (no company/contact guessing here).
 */
function profileAlternatingSection(
    sectionRows: RawSourceRow[],
): SourceSchemaProfile | null {
    const nonEmptyRows = sectionRows.filter(
        row => countNonEmpty(row.values) === 1,
    );

    if (nonEmptyRows.length < MIN_SECTION_NON_EMPTY_ROWS) {
        return null;
    }

    const values = nonEmptyRows.map(firstNonEmptyValue);
    const emailCount = values.filter(isEmail).length;

    if (emailCount < Math.ceil(nonEmptyRows.length * 0.25)) {
        return null;
    }

    const maxColumns = Math.max(
        ...sectionRows.map(row => row.values.length),
        1,
    );

    return {
        sourceType: "EMAIL_LIST",
        headerRowIndex: null,
        dataStartRowIndex: nonEmptyRows[0].rowIndex - 1,
        columns: Array.from(
            { length: maxColumns },
            (_, index) => `column_${index + 1}`,
        ),
        mappings: [
            {
                sourceColumn: "column_1",
                targetField: "contactEmail",
                confidence: 0.99,
                reason:
                    "Alternating single-value section is dominated by email values; column_1 values are direct contact emails.",
            },
        ],
        confidence: 0.99,
        requiresReview: true,
        notes: [
            "Alternating single-value section: records pair a non-email value with a following email value.",
            `${emailCount} email values and ${nonEmptyRows.length - emailCount} non-email values detected in the section.`,
            "Non-email companion values are NOT semantically mapped (no company/contact inference here); confirm via review before transformation.",
        ],
    };
}

interface SectionCandidate {
    structuralPattern:
        | "TABULAR_MULTI_COLUMN"
        | "ALTERNATING_SINGLE_VALUE"
        | "SINGLE_SECTION";
    startRowIndex: number;
    endRowIndex: number;
    rows: RawSourceRow[];
    nonEmptyRowCount: number;
    titleRowIndices: number[];
    malformedRecordCount: number;
    structuredRecordCount: number;
}

function newTabularCandidate(
    startRowIndex: number,
    endRowIndex: number,
): SectionCandidate {
    return {
        structuralPattern: "TABULAR_MULTI_COLUMN",
        startRowIndex,
        endRowIndex,
        rows: [],
        nonEmptyRowCount: 0,
        titleRowIndices: [],
        malformedRecordCount: 0,
        structuredRecordCount: 0,
    };
}

/**
 * Split a raw spreadsheet source into independent structural sections.
 * Generic: no file names, no language lists, no hardcoded row numbers,
 * and no assumption that differing multi-row column counts imply
 * different sections.
 */
export function splitRawSourceSections(
    rows: RawSourceRow[],
): RawSourceSplitResult {
    if (rows.length === 0) {
        return {
            isSingleSection: true,
            sections: [],
            notes: ["Source contains no rows."],
        };
    }

    const mixedDetection = detectMixedSections(rows);

    if (!mixedDetection.isMixed) {
        return {
            isSingleSection: true,
            sections: [
                {
                    startRowIndex: rows[0].rowIndex,
                    endRowIndex:
                        rows[rows.length - 1].rowIndex,
                    structuralPattern: "SINGLE_SECTION",
                    rawRows: rows,
                    nonEmptyRowCount: rows.filter(
                        row => countNonEmpty(row.values) > 0,
                    ).length,
                    sectionTitleRowIndices: [],
                    structuredRecordCount: 0,
                    malformedRecordCount: 0,
                    profile: null,
                    confidence: 1.0,
                    requiresReview: false,
                    notes: [
                        "Single structural regime: no section splitting performed; whole-source profiling applies unchanged.",
                    ],
                },
            ],
            notes: [],
        };
    }

    const runs = buildStructuralRuns(rows);

    const normalizedValueCounts = new Map<
        string,
        number
    >();

    for (const row of rows) {
        if (countNonEmpty(row.values) !== 1) {
            continue;
        }

        const normalized = firstNonEmptyValue(row)
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

        if (normalized && !isEmail(normalized)) {
            normalizedValueCounts.set(
                normalized,
                (normalizedValueCounts.get(normalized) ?? 0) +
                    1,
            );
        }
    }

    const candidates: SectionCandidate[] = [];

    let currentTabular: SectionCandidate | null = null;

    const flushTabular = () => {
        if (currentTabular) {
            candidates.push(currentTabular);
            currentTabular = null;
        }
    };

    for (
        let runIndex = 0;
        runIndex < runs.length;
        runIndex++
    ) {
        const run = runs[runIndex];

        if (run.kind === "multi") {
            // Blank rows are transparent: any multi run continues the
            // active tabular candidate; a new one starts only when no
            // candidate is active.
            if (!currentTabular) {
                currentTabular = newTabularCandidate(
                    run.startRowIndex,
                    run.endRowIndex,
                );
            }

            currentTabular.endRowIndex = run.endRowIndex;
            currentTabular.nonEmptyRowCount +=
                run.nonEmptyRowCount;
            currentTabular.rows.push(...run.rows);

            continue;
        }

        /*
         * Single-value run: decide straggler vs independent section from
         * its structural surroundings, NOT from its length alone. A run
         * tightly surrounded by multi-value rows on BOTH sides (within
         * MIXED_SECTION_MAX_STRAGGLER_GAP) is an incomplete record inside
         * a tabular regime. An alternating regime separated by blank rows
         * also produces short runs — but those are NOT surrounded by
         * multi rows, so they correctly form their own section(s).
         */
        let previousMulti: StructuralRun | null = null;

        for (
            let index = runIndex - 1;
            index >= 0;
            index--
        ) {
            if (runs[index].kind === "multi") {
                previousMulti = runs[index];
                break;
            }
        }

        let nextMulti: StructuralRun | null = null;

        for (
            let index = runIndex + 1;
            index < runs.length;
            index++
        ) {
            if (runs[index].kind === "multi") {
                nextMulti = runs[index];
                break;
            }
        }

        const gapBefore = previousMulti
            ? run.startRowIndex -
                previousMulti.endRowIndex -
                1
            : Number.MAX_SAFE_INTEGER;

        const gapAfter = nextMulti
            ? nextMulti.startRowIndex -
                run.endRowIndex -
                1
            : Number.MAX_SAFE_INTEGER;

        const isStraggler =
            previousMulti !== null &&
            nextMulti !== null &&
            gapBefore <= MIXED_SECTION_MAX_STRAGGLER_GAP &&
            gapAfter <= MIXED_SECTION_MAX_STRAGGLER_GAP;

        if (isStraggler) {
            // Absorb into the active tabular candidate (create one if
            // none exists yet): one or two incomplete rows must not
            // split a section.
            if (!currentTabular) {
                currentTabular = newTabularCandidate(
                    run.startRowIndex,
                    run.endRowIndex,
                );
            }

            currentTabular.endRowIndex = Math.max(
                currentTabular.endRowIndex,
                run.endRowIndex,
            );
            currentTabular.rows.push(...run.rows);

            continue;
        }

        // Independent single-value regime: a real section boundary.
        flushTabular();

        const analysis = analyzeAlternatingRun(
            run,
            normalizedValueCounts,
        );

        const structuredRecords =
            analysis.structuredRecordCount;
        const malformed =
            analysis.malformedRecordCount;
        const recognizable =
            structuredRecords + malformed >= 3;

        candidates.push({
            structuralPattern: recognizable
                ? "ALTERNATING_SINGLE_VALUE"
                : "SINGLE_SECTION",
            startRowIndex: run.startRowIndex,
            endRowIndex: run.endRowIndex,
            rows: run.rows,
            nonEmptyRowCount: run.nonEmptyRowCount,
            titleRowIndices: analysis.titleRowIndices,
            malformedRecordCount: malformed,
            structuredRecordCount: structuredRecords,
        });
    }

    flushTabular();

    const sections: RawSourceSection[] = candidates.map(
        candidate => {
            const isAlternating =
                candidate.structuralPattern ===
                "ALTERNATING_SINGLE_VALUE";

            const profile = isAlternating
                ? profileAlternatingSection(candidate.rows)
                : profileTabularSectionSafely(
                    candidate.rows,
                );

            const notes: string[] = [
                `Structural section (${candidate.structuralPattern}) spanning original rows ${candidate.startRowIndex}-${candidate.endRowIndex} (${candidate.nonEmptyRowCount} non-empty rows).`,
            ];

            if (candidate.titleRowIndices.length > 0) {
                notes.push(
                    `${candidate.titleRowIndices.length} structural section-title row(s) detected (conservative: repeated single-value text); recorded for provenance, never treated as lead records.`,
                );
            }

            if (isAlternating) {
                if (candidate.structuredRecordCount > 0) {
                    notes.push(
                        `${candidate.structuredRecordCount} well-formed value/email pair(s) detected structurally.`,
                    );
                }

                if (candidate.malformedRecordCount > 0) {
                    notes.push(
                        `${candidate.malformedRecordCount} malformed/incomplete record(s) (missing value or email slot); preserved raw, flagged for review.`,
                    );
                }
            }

            const confidence =
                profile === null
                    ? 0
                    : Math.min(
                        profile.confidence,
                        isAlternating ? 0.85 : 0.9,
                    );

            const requiresReview =
                profile === null ||
                profile.requiresReview ||
                candidate.malformedRecordCount > 0 ||
                isAlternating;

            if (profile === null) {
                notes.push(
                    "Section cannot be profiled safely as an independent schema (too few rows or not predominantly tabular); raw rows preserved, REVIEW_REQUIRED.",
                );
            }

            return {
                startRowIndex: candidate.startRowIndex,
                endRowIndex: candidate.endRowIndex,
                structuralPattern:
                    candidate.structuralPattern,
                rawRows: candidate.rows,
                nonEmptyRowCount:
                    candidate.nonEmptyRowCount,
                sectionTitleRowIndices:
                    candidate.titleRowIndices,
                structuredRecordCount:
                    candidate.structuredRecordCount,
                malformedRecordCount:
                    candidate.malformedRecordCount,
                profile,
                confidence,
                requiresReview,
                notes,
            };
        },
    );

    const profileableCount = sections.filter(
        section => section.profile !== null,
    ).length;

    const sectionNotes: string[] = [
        `Mixed source split into ${sections.length} structural section(s); ${profileableCount} section(s) profiled independently.`,
        "Blank rows are treated as separators/transparent structure, never lead records.",
        "Original row indices are preserved exactly for every section.",
    ];

    if (sections.some(section => section.requiresReview)) {
        sectionNotes.push(
            "At least one section requires review; no destructive transformation is performed on mixed sources.",
        );
    }

    return {
        isSingleSection: false,
        sections,
        notes: sectionNotes,
    };
}

/**
 * Convenience wrapper mirroring the mixed detection contract used by the
 * profiler: analyze a raw source and report whether it is mixed, without
 * changing any profiler classification behavior.
 */
export function analyzeMixedSource(
    rows: RawSourceRow[],
): {
    isMixed: boolean;
    sections: RawSourceSection[];
    notes: string[];
} {
    const split = splitRawSourceSections(rows);

    return {
        isMixed: !split.isSingleSection,
        sections: split.sections,
        notes: split.notes,
    };
}
