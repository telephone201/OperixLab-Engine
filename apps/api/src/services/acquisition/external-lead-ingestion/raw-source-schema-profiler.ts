import type {
    ExternalField,
    ExternalSourceType,
    SourceColumnMapping,
    SourceSchemaProfile,
} from "./source-schema-profile";

export interface RawSourceRow {
    rowIndex: number;
    values: unknown[];
}

function clean(value: unknown): string {
    return String(value ?? "")
        .replace(/\uFEFF/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalize(value: unknown): string {
    return clean(value)
        .toLowerCase()
        .replace(/[–—]/g, "-");
}

function isEmpty(value: unknown): boolean {
    return clean(value) === "";
}

export function isEmail(value: unknown): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function isPhone(value: unknown): boolean {
    const text = clean(value);
    if (!text) return false;

    const digits = text.replace(/\D/g, "");

    return digits >= "0000000" && digits.length >= 7 && digits.length <= 15;
}

function isUrl(value: unknown): boolean {
    const text = normalize(value);

    return (
        text.startsWith("http://") ||
        text.startsWith("https://") ||
        text.startsWith("www.")
    );
}

function isSocialUrl(value: unknown): boolean {
    const text = normalize(value);

    return (
        text.includes("facebook.com") ||
        text.includes("instagram.com") ||
        text.includes("linkedin.com") ||
        text.includes("twitter.com") ||
        text.includes("x.com") ||
        text.includes("tiktok.com")
    );
}

function looksLikePersonName(value: unknown): boolean {
    const text = clean(value);

    if (!text || text.length < 2 || text.length > 80) {
        return false;
    }

    if (isEmail(text) || isPhone(text) || isUrl(text)) {
        return false;
    }

    if (text.includes("@")) {
        return false;
    }

    if (/\d/.test(text)) {
        return false;
    }

    const words = text.split(/\s+/).filter(Boolean);

    if (words.length < 1 || words.length > 5) {
        return false;
    }

    /*
     * Person names generally contain relatively short words.
     * This intentionally avoids classifying long business descriptions
     * as people.
     */
    const averageWordLength =
        words.reduce((sum, word) => sum + word.length, 0) /
        words.length;

    return averageWordLength <= 18;
}

function looksLikeCompanyName(value: unknown): boolean {
    const text = clean(value);

    if (!text || text.length < 2 || text.length > 300) {
        return false;
    }

    if (isEmail(text) || isPhone(text) || isUrl(text)) {
        return false;
    }

    if (text.includes("@")) {
        return false;
    }

    const companySignals = [
        "company",
        "co.",
        "corp",
        "corporation",
        "group",
        "restaurant",
        "restaurants",
        "cafe",
        "coffee",
        "foods",
        "food",
        "hotel",
        "hotel",
        "مطعم",
        "مطاعم",
        "كافيه",
        "شركة",
        "مؤسسة",
        "مجموعة",
        "مخبز",
        "حلويات",
    ];

    const normalized = normalize(text);

    if (
        companySignals.some(signal =>
            normalized.includes(signal),
        )
    ) {
        return true;
    }

    /*
     * Long descriptive text is much more likely to represent a
     * business/company description than a person's name.
     */
    if (text.length >= 45) {
        return true;
    }

    return false;
}

function looksLikeJobTitle(value: unknown): boolean {
    const text = clean(value);

    if (!text || text.length > 100) {
        return false;
    }

    if (isEmail(text) || isPhone(text) || isUrl(text)) {
        return false;
    }

    const signals = [
        "manager",
        "manager",
        "owner",
        "cashier",
        "cook",
        "chef",
        "bartender",
        "supervisor",
        "director",
        "assistant",
        "specialist",
        "officer",
        "executive",
        "developer",
        "engineer",
        "sales",
        "marketing",
        "human resource",
        "hr",
        "waiter",
        "waitress",
        "serveuse",
        "branch",
        "مدير",
        "مشرف",
        "موظف",
        "كاشير",
        "طباخ",
        "شيف",
    ];

    const normalized = normalize(text);

    return signals.some(signal =>
        normalized.includes(signal),
    );
}

function looksLikeLocation(value: unknown): boolean {
    const text = clean(value);

    if (!text || text.length > 100) {
        return false;
    }

    if (isEmail(text) || isPhone(text) || isUrl(text)) {
        return false;
    }

    /*
     * Location is deliberately conservative.
     * We only classify values that contain clear geographic
     * wording or a country/city-style multi-token pattern.
     */
    const signals = [
        "city",
        "egypt",
        "india",
        "bangladesh",
        "philippines",
        "saudi",
        "kuwait",
        "uae",
        "emirates",
        "cairo",
        "riyadh",
        "dubai",
        "dhaka",
        "mansoura",
        "benha",
        "alexandria",
        "القاهرة",
        "الرياض",
        "دبي",
    ];

    const normalized = normalize(text);

    return signals.some(signal =>
        normalized.includes(signal),
    );
}

function isLikelyHeader(values: unknown[]): boolean {
    const normalized = values.map(normalize).filter(Boolean);

    if (normalized.length === 0) return false;

    const headerTerms = [
        "company",
        "company name",
        "business",
        "business name",
        "business address",
        "business phone",
        "phone",
        "mobile",
        "mobile no",
        "telephone",
        "tel",
        "first name",
        "last name",
        "full name",
        "name",
        "email",
        "e-mail",
        "mail",
        "job",
        "job title",
        "title",
        "position",
        "role",
        "work",
        "address",
        "city",
        "country",
        "website",
        "url",
        "industry",
        "sector",
        "date extracted",
        "مسلسل",
        "اسم الشركة",
        "الشركة",
        "البريد الإلكتروني",
        "الايميل",
        "الهاتف",
        "رقم الهاتف",
        "رقم الاتصال",
        "اسم",
        "الاسم",
        "الاسم الأول",
        "اسم العائلة",
        "الوظيفة",
        "العنوان",
        "المدينة",
        "الدولة",
    ];

    let score = 0;

    for (const value of normalized) {
        if (headerTerms.includes(value)) {
            score += 3;
        } else if (
            value.includes("company") ||
            value.includes("business") ||
            value.includes("email") ||
            value.includes("phone") ||
            value.includes("mobile") ||
            value.includes("name") ||
            value.includes("address") ||
            value.includes("job") ||
            value.includes("title") ||
            value.includes("work") ||
            value.includes("date extracted") ||
            value.includes("شركة") ||
            value.includes("بريد") ||
            value.includes("هاتف") ||
            value.includes("اسم") ||
            value.includes("وظيف") ||
            value.includes("عنوان")
        ) {
            score += 1;
        }
    }

    return score >= Math.max(3, Math.ceil(normalized.length * 0.75));
}

function looksLikeEmailList(rows: RawSourceRow[]): boolean {
    const values = rows
        .flatMap(row => row.values)
        .map(clean)
        .filter(Boolean);

    if (values.length === 0) return false;

    const commaSeparatedEmailList = values.some(value => {
        const parts = value
            .split(",")
            .map(part => part.trim())
            .filter(Boolean);

        return (
            parts.length >= 2 &&
            parts.filter(isEmail).length >=
                Math.ceil(parts.length * 0.7)
        );
    });

    if (commaSeparatedEmailList) {
        return true;
    }

    const emailLikeCount = values.filter(isEmail).length;

    return emailLikeCount / values.length >= 0.70;
}

export function countNonEmpty(values: unknown[]): number {
    return values.filter(value => !isEmpty(value)).length;
}

const MIXED_SECTION_MIN_MULTI_VALUE_ROWS = 3;
export const MIXED_SECTION_MIN_SECTION_RUN_ROWS = 5;

export interface MixedSectionDetection {
    isMixed: boolean;
    sectionCount: number;
    longestSectionRunRows: number;
    singleValueRowCount: number;
    multiValueRowCount: number;
}

/*
 * Detect a mixed / multi-section source: rows that carry one logical
 * schema (multi-column records) coexisting with an extended single-value
 * list regime (e.g. company/email/blank rows after a tabular block).
 *
 * Deliberately NOT based on varying multi-row column counts: a
 * headerless file whose rows carry 3, 4 or 5 values can still be one
 * schema. Short single-value stragglers (1-2 consecutive rows, e.g. one
 * incomplete record) also do not make a source mixed; the single-value
 * regime must extend over MIXED_SECTION_MIN_SECTION_RUN_ROWS non-empty
 * rows to count as its own section. Blank rows inside a run do not
 * break it (list sections are commonly blank-line separated).
 */
export function detectMixedSections(
    rows: RawSourceRow[],
): MixedSectionDetection {
    const multiValueRowCount = rows.filter(
        row => countNonEmpty(row.values) > 1,
    ).length;

    const singleValueRowCount = rows.filter(
        row => countNonEmpty(row.values) === 1,
    ).length;

    const notMixed: MixedSectionDetection = {
        isMixed: false,
        sectionCount: 0,
        longestSectionRunRows: 0,
        singleValueRowCount,
        multiValueRowCount,
    };

    if (
        multiValueRowCount <
        MIXED_SECTION_MIN_MULTI_VALUE_ROWS
    ) {
        return notMixed;
    }

    /*
     * Walk rows in file order. Blank rows are transparent (they neither
     * extend nor break a run); every multi-column row terminates the
     * current single-value run.
     */
    const runs: number[] = [];

    let currentRunRows = 0;

    for (const row of rows) {
        const nonEmptyCount = countNonEmpty(row.values);

        if (nonEmptyCount === 0) {
            continue;
        }

        if (nonEmptyCount === 1) {
            currentRunRows++;

            continue;
        }

        if (currentRunRows > 0) {
            runs.push(currentRunRows);
            currentRunRows = 0;
        }
    }

    if (currentRunRows > 0) {
        runs.push(currentRunRows);
    }

    const sectionRuns = runs.filter(
        run => run >= MIXED_SECTION_MIN_SECTION_RUN_ROWS,
    );

    return {
        isMixed: sectionRuns.length >= 1,
        sectionCount: sectionRuns.length,
        longestSectionRunRows:
            sectionRuns.length > 0
                ? Math.max(...sectionRuns)
                : 0,
        singleValueRowCount,
        multiValueRowCount,
    };
}

export function inferField(
    values: unknown[],
): {
    field: ExternalField | null;
    confidence: number;
    reason: string;
} {
    const cleanValues = values.filter(value => !isEmpty(value));

    if (cleanValues.length === 0) {
        return {
            field: null,
            confidence: 0,
            reason: "No usable values",
        };
    }

    const emailRatio =
        cleanValues.filter(isEmail).length /
        cleanValues.length;

    if (emailRatio >= 0.70) {
        return {
            field: "contactEmail",
            confidence: 0.96,
            reason: "Values strongly match email addresses",
        };
    }

    const phoneRatio =
        cleanValues.filter(isPhone).length /
        cleanValues.length;

    if (phoneRatio >= 0.70) {
        return {
            field: "phone",
            confidence: 0.96,
            reason: "Values strongly match phone numbers",
        };
    }

    const socialRatio =
        cleanValues.filter(isSocialUrl).length /
        cleanValues.length;

    if (socialRatio >= 0.70) {
        return {
            field: "sourceUrl",
            confidence: 0.96,
            reason: "Values strongly match social profile URLs",
        };
    }

    const urlRatio =
        cleanValues.filter(isUrl).length /
        cleanValues.length;

    if (urlRatio >= 0.70) {
        return {
            field: "website",
            confidence: 0.90,
            reason: "Values strongly match URLs",
        };
    }

    return {
        field: null,
        confidence: 0,
        reason: "No deterministic primitive type",
    };
}

function inferHeaderField(header: string): {
    field: ExternalField | null;
    confidence: number;
    reason: string;
} {
    const value = normalize(header);

    if (
        [
            "company",
            "company name",
            "business",
            "business name",
            "اسم الشركة",
            "الشركة",
        ].includes(value)
    ) {
        return {
            field: "companyName",
            confidence: 0.99,
            reason: "Explicit company header",
        };
    }

    if (
        [
            "phone",
            "mobile",
            "mobile no",
            "mobile no.",
            "telephone",
            "tel",
            "tel1",
            "tel2",
            "business phone",
            "الهاتف",
            "رقم الهاتف",
            "رقم الاتصال",
        ].includes(value)
    ) {
        return {
            field: "phone",
            confidence: 0.99,
            reason: "Explicit phone header",
        };
    }

    if (
        [
            "email",
            "e-mail",
            "mail",
            "mail address",
            "email address",
            "الايميل",
            "البريد الإلكتروني",
            "الايميل - البريد الإلكتروني",
        ].includes(value)
    ) {
        return {
            field: "contactEmail",
            confidence: 0.99,
            reason: "Explicit email header",
        };
    }

    if (
        [
            "first name",
            "firstname",
            "الاسم الأول",
        ].includes(value)
    ) {
        return {
            field: "firstName",
            confidence: 0.99,
            reason: "Explicit first-name header",
        };
    }

    if (
        [
            "last name",
            "lastname",
            "اسم العائلة",
        ].includes(value)
    ) {
        return {
            field: "lastName",
            confidence: 0.99,
            reason: "Explicit last-name header",
        };
    }

    if (
        [
            "name",
            "full name",
            "contact name",
            "اسم",
            "الاسم",
        ].includes(value)
    ) {
        return {
            field: "contactName",
            confidence: 0.98,
            reason: "Explicit contact-name header",
        };
    }

    if (
        [
            "job",
            "job title",
            "title",
            "position",
            "role",
            "work",
            "الوظيفة",
        ].includes(value)
    ) {
        return {
            field: "contactTitle",
            confidence: 0.96,
            reason: "Explicit job/title header",
        };
    }

    if (
        [
            "business address",
            "address",
            "العنوان",
        ].includes(value)
    ) {
        return {
            field: "address",
            confidence: 0.96,
            reason: "Explicit address header",
        };
    }

    if (
        [
            "city",
            "المدينة",
        ].includes(value)
    ) {
        return {
            field: "city",
            confidence: 0.99,
            reason: "Explicit city header",
        };
    }

    if (
        [
            "country",
            "الدولة",
        ].includes(value)
    ) {
        return {
            field: "country",
            confidence: 0.99,
            reason: "Explicit country header",
        };
    }

    if (
        [
            "website",
            "web",
            "url",
            "site",
        ].includes(value)
    ) {
        return {
            field: "website",
            confidence: 0.97,
            reason: "Explicit website header",
        };
    }

    if (
        [
            "facebook url",
            "facebook",
            "instagram",
            "instagram url",
            "linkedin",
            "linkedin url",
            "social url",
            "source url",
        ].includes(value)
    ) {
        return {
            field: "sourceUrl",
            confidence: 0.98,
            reason: "Explicit social/source URL header",
        };
    }

    if (
        [
            "date extracted",
            "date",
            "extracted date",
            "تاريخ الاستخراج",
        ].includes(value)
    ) {
        return {
            field: "ignore",
            confidence: 0.99,
            reason: "Explicit extraction/date metadata header",
        };
    }

    if (
        [
            "serial",
            "no",
            "number",
            "id",
            "مسلسل",
            "الرقم",
        ].includes(value)
    ) {
        return {
            field: "externalId",
            confidence: 0.95,
            reason: "Explicit source identifier header",
        };
    }

    return {
        field: null,
        confidence: 0,
        reason: "Unknown header",
    };
}

function classifyHeaderedSource(
    columns: string[],
): ExternalSourceType {
    const normalized = columns.map(normalize);

    const hasContactSignals = normalized.some(value =>
        [
            "first name",
            "last name",
            "full name",
            "contact name",
            "job",
            "job title",
            "position",
            "role",
            "work",
            "email",
            "e-mail",
            "mobile",
            "phone",
        ].includes(value),
    );

    const hasBusinessSignals = normalized.some(value =>
        [
            "company",
            "company name",
            "business",
            "business name",
            "business address",
            "business phone",
            "industry",
            "sector",
        ].includes(value),
    );

    if (hasContactSignals && !hasBusinessSignals) {
        return "CONTACT_DATABASE";
    }

    if (hasContactSignals && hasBusinessSignals) {
        return "POSSIBLE_BUSINESS_DATABASE";
    }

    return "BUSINESS_DATABASE";
}

function inferHeaderlessMappings(
    rows: RawSourceRow[],
): SourceColumnMapping[] {
    const maxColumns =
        Math.max(
            ...rows.map(row => row.values.length),
        );

    const mappings: SourceColumnMapping[] = [];

    const columns = Array.from(
        { length: maxColumns },
        (_, index) =>
            rows
                .map(row => row.values[index])
                .filter(value => !isEmpty(value)),
    );

    const primitive = columns.map(values =>
        inferField(values),
    );

    /*
     * First preserve deterministic primitive types:
     * phone / email / URL.
     */
    for (let index = 0; index < columns.length; index++) {
        const result = primitive[index];

        if (result.field) {
            mappings.push({
                sourceColumn: `column_${index + 1}`,
                targetField: result.field,
                confidence: result.confidence,
                reason: result.reason,
            });
        }
    }

    /*
     * Detect a common 4-column contact/business pattern:
     *
     * phone | social URL | person | business
     */
    if (
        maxColumns === 4 &&
        primitive[0]?.field === "phone" &&
        primitive[1]?.field === "sourceUrl"
    ) {
        const personValues = columns[2];
        const companyValues = columns[3];

        const personRatio =
            personValues.filter(looksLikePersonName).length /
            Math.max(personValues.length, 1);

        const companyRatio =
            companyValues.filter(looksLikeCompanyName).length /
            Math.max(companyValues.length, 1);

        if (personRatio >= 0.80) {
            mappings.push({
                sourceColumn: "column_3",
                targetField: "contactName",
                confidence: 0.94,
                reason: "Detected phone + social URL + person + business column pattern",
            });
        }

        if (companyRatio >= 0.70) {
            mappings.push({
                sourceColumn: "column_4",
                targetField: "companyName",
                confidence: 0.94,
                reason: "Detected phone + social URL + person + business column pattern",
            });
        }
    }

    /*
     * Detect a common 5-column contact/business pattern:
     *
     * phone | person | business | job | location
     */
    if (
        maxColumns === 5 &&
        primitive[0]?.field === "phone"
    ) {
        const personValues = columns[1];
        const companyValues = columns[2];
        const titleValues = columns[3];
        const locationValues = columns[4];

        const personRatio =
            personValues.filter(looksLikePersonName).length /
            Math.max(personValues.length, 1);

        const companyRatio =
            companyValues.filter(looksLikeCompanyName).length /
            Math.max(companyValues.length, 1);

        const titleRatio =
            titleValues.filter(looksLikeJobTitle).length /
            Math.max(titleValues.length, 1);

        const locationRatio =
            locationValues.filter(looksLikeLocation).length /
            Math.max(locationValues.length, 1);

        if (personRatio >= 0.80) {
            mappings.push({
                sourceColumn: "column_2",
                targetField: "contactName",
                confidence: 0.92,
                reason: "Detected phone + person + business + job + location pattern",
            });
        }

        if (companyRatio >= 0.60) {
            mappings.push({
                sourceColumn: "column_3",
                targetField: "companyName",
                confidence: 0.92,
                reason: "Detected phone + person + business + job + location pattern",
            });
        }

        if (titleRatio >= 0.50) {
            mappings.push({
                sourceColumn: "column_4",
                targetField: "contactTitle",
                confidence: 0.88,
                reason: "Detected job-title values in fourth column",
            });
        }

        if (locationRatio >= 0.40) {
            mappings.push({
                sourceColumn: "column_5",
                targetField: "location",
                confidence: 0.82,
                reason: "Detected geographic values in fifth column",
            });
        }
    }

    /*
     * Remove duplicate mappings for the same source column.
     * Prefer the highest-confidence interpretation.
     */
    const bestByColumn = new Map<
        string,
        SourceColumnMapping
    >();

    for (const mapping of mappings) {
        const existing =
            bestByColumn.get(mapping.sourceColumn);

        if (
            !existing ||
            mapping.confidence > existing.confidence
        ) {
            bestByColumn.set(
                mapping.sourceColumn,
                mapping,
            );
        }
    }

    return Array.from(bestByColumn.values()).sort(
        (a, b) =>
            Number(
                a.sourceColumn.replace("column_", ""),
            ) -
            Number(
                b.sourceColumn.replace("column_", ""),
            ),
    );
}

export class RawSourceSchemaProfiler {
    profile(rows: RawSourceRow[]): SourceSchemaProfile {
        if (rows.length === 0) {
            return {
                sourceType: "UNKNOWN",
                headerRowIndex: null,
                dataStartRowIndex: 0,
                columns: [],
                mappings: [],
                confidence: 0,
                requiresReview: true,
                notes: ["Source contains no rows."],
            };
        }

        const firstNonEmptyIndex = rows.findIndex(row =>
            row.values.some(value => !isEmpty(value)),
        );

        if (firstNonEmptyIndex === -1) {
            return {
                sourceType: "UNKNOWN",
                headerRowIndex: null,
                dataStartRowIndex: 0,
                columns: [],
                mappings: [],
                confidence: 0,
                requiresReview: true,
                notes: ["Source contains only empty rows."],
            };
        }

        if (
            looksLikeEmailList(
                rows.slice(firstNonEmptyIndex),
            )
        ) {
            return {
                sourceType: "EMAIL_LIST",
                headerRowIndex: null,
                dataStartRowIndex: firstNonEmptyIndex,
                columns: ["column_1"],
                mappings: [
                    {
                        sourceColumn: "column_1",
                        targetField: "contactEmail",
                        confidence: 0.99,
                        reason: "Source is primarily an email list",
                    },
                ],
                confidence: 0.99,
                requiresReview: false,
                notes: [
                    "Email list detected from actual cell values.",
                    "Comma-separated email values must be expanded during transformation.",
                ],
            };
        }

        /*
         * Mixed / multi-section detection must run BEFORE any single
         * file-wide classification (headered or headerless), so a file
         * that changes structural pattern mid-sheet is never profiled
         * as one schema.
         */
        const mixedDetection = detectMixedSections(
            rows.slice(firstNonEmptyIndex),
        );

        if (mixedDetection.isMixed) {
            const maxColumns = Math.max(
                ...rows.map(row => row.values.length),
            );

            return {
                sourceType: "MIXED_OR_MULTI_SECTION",
                headerRowIndex: null,
                dataStartRowIndex: firstNonEmptyIndex,
                columns: Array.from(
                    { length: maxColumns },
                    (_, index) => `column_${index + 1}`,
                ),
                mappings: [],
                confidence: 0,
                requiresReview: true,
                notes: [
                    "Source contains multiple structural sections; no single file-wide schema is inferred.",
                    `Detected ${mixedDetection.sectionCount} extended single-value section run(s) (longest ${mixedDetection.longestSectionRunRows} rows, ${mixedDetection.singleValueRowCount} single-value rows total) alongside ${mixedDetection.multiValueRowCount} multi-column rows; section splitting requires human review.`,
                    "No destructive transformation will be applied to a mixed source.",
                ],
            };
        }

        const headerRow = rows.find(row =>
            isLikelyHeader(row.values),
        );

        if (headerRow) {
            const columns = headerRow.values.map(
                (value, index) =>
                    clean(value) || `column_${index + 1}`,
            );

            const mappings: SourceColumnMapping[] = [];

            for (
                let index = 0;
                index < columns.length;
                index++
            ) {
                const headerMapping =
                    inferHeaderField(columns[index]);

                if (headerMapping.field) {
                    mappings.push({
                        sourceColumn: columns[index],
                        targetField: headerMapping.field,
                        confidence: headerMapping.confidence,
                        reason: headerMapping.reason,
                    });

                    continue;
                }

                const values = rows
                    .filter(row =>
                        row.rowIndex > headerRow.rowIndex,
                    )
                    .map(row => row.values[index])
                    .filter(value => !isEmpty(value));

                const inferred = inferField(values);

                if (inferred.field) {
                    mappings.push({
                        sourceColumn: columns[index],
                        targetField: inferred.field,
                        confidence: inferred.confidence,
                        reason: inferred.reason,
                    });
                }
            }

            const sourceType =
                classifyHeaderedSource(columns);

            const hasCompany =
                mappings.some(
                    mapping =>
                        mapping.targetField === "companyName",
                );

            const hasContact =
                mappings.some(
                    mapping =>
                        mapping.targetField === "contactName" ||
                        mapping.targetField === "firstName" ||
                        mapping.targetField === "contactEmail",
                );

            return {
                sourceType,
                headerRowIndex: headerRow.rowIndex - 1,
                dataStartRowIndex: headerRow.rowIndex,
                columns,
                mappings,
                confidence:
                    mappings.length > 0
                        ? mappings.reduce(
                            (sum, item) =>
                                sum + item.confidence,
                            0,
                        ) / mappings.length
                        : 0,
                requiresReview:
                    !hasCompany && !hasContact,
                notes: [],
            };
        }

        const maxColumns =
            Math.max(
                ...rows.map(row => row.values.length),
            );

        const mappings =
            inferHeaderlessMappings(
                rows.slice(firstNonEmptyIndex),
            );

        return {
            sourceType: "HEADERLESS_OR_MALFORMED",
            headerRowIndex: null,
            dataStartRowIndex: firstNonEmptyIndex,
            columns: Array.from(
                { length: maxColumns },
                (_, index) => `column_${index + 1}`,
            ),
            mappings,
            confidence:
                mappings.length > 0
                    ? mappings.reduce(
                        (sum, item) =>
                            sum + item.confidence,
                        0,
                    ) / mappings.length
                    : 0,
            requiresReview: true,
            notes: [
                "No reliable header detected; mappings inferred from raw cell values and structural column patterns.",
            ],
        };
    }
}

export const rawSourceSchemaProfiler =
    new RawSourceSchemaProfiler();

