import type {
    ExternalField,
    ExternalSourceType,
    SourceColumnMapping,
    SourceSchemaProfile,
} from "./source-schema-profile";

function clean(value: unknown): string {
    return String(value ?? "")
        .replace(/\uFEFF/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalize(value: unknown): string {
    return clean(value).toLowerCase();
}

function isEmail(value: unknown): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function isPhone(value: unknown): boolean {
    const valueText = clean(value);
    if (!valueText) return false;
    return valueText.replace(/\D/g, "").length >= 7;
}

function isUrl(value: unknown): boolean {
    const valueText = normalize(value);
    return (
        valueText.startsWith("http://") ||
        valueText.startsWith("https://") ||
        valueText.startsWith("www.")
    );
}

function looksLikeSocialUrl(value: unknown): boolean {
    const valueText = normalize(value);

    return (
        valueText.includes("facebook.com") ||
        valueText.includes("instagram.com") ||
        valueText.includes("linkedin.com") ||
        valueText.includes("twitter.com") ||
        valueText.includes("x.com") ||
        valueText.includes("tiktok.com")
    );
}

function looksLikeCompany(value: unknown): boolean {
    const text = clean(value);
    if (!text || isEmail(text) || isPhone(text) || isUrl(text)) return false;

    return (
        text.length >= 3 &&
        (
            /company|business|group|restaurant|cafe|llc|ltd|co\./i.test(text) ||
            /شركة|مؤسسة|مجموعة|مطعم|كافيه/.test(text)
        )
    );
}

function looksLikePersonName(value: unknown): boolean {
    const text = clean(value);
    if (!text || isEmail(text) || isPhone(text) || isUrl(text)) return false;

    const words = text.split(/\s+/);
    return words.length >= 2 && words.length <= 5;
}

function addMapping(
    mappings: SourceColumnMapping[],
    sourceColumn: string,
    targetField: ExternalField,
    confidence: number,
    reason: string,
): void {
    mappings.push({
        sourceColumn,
        targetField,
        confidence,
        reason,
    });
}

export class ExternalSourceSchemaMapper {
    map(
        sourceType: ExternalSourceType,
        columns: string[],
        options?: {
            sampleRows?: Record<string, unknown>[];
            headerRowIndex?: number | null;
        },
    ): SourceSchemaProfile {
        const rows = options?.sampleRows ?? [];
        const mappings: SourceColumnMapping[] = [];
        const notes: string[] = [];

        // Explicit headers first.
        for (const column of columns) {
            const normalized = normalize(column);

            if (
                [
                    "company",
                    "company name",
                    "business",
                    "business name",
                    "اسم الشركة",
                    "الشركة",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "companyName",
                    0.99,
                    "Explicit company/business field",
                );
                continue;
            }

            if (
                ["first name", "firstname", "الاسم الأول"].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "firstName",
                    0.99,
                    "Explicit first-name field",
                );
                continue;
            }

            if (
                [
                    "last name",
                    "lastname",
                    "family name",
                    "اسم العائلة",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "lastName",
                    0.99,
                    "Explicit last-name field",
                );
                continue;
            }

            if (
                [
                    "full name",
                    "contact name",
                    "name",
                    "اسم",
                    "الاسم",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "contactName",
                    0.98,
                    "Explicit contact/name field",
                );
                continue;
            }

            if (
                [
                    "email",
                    "e-mail",
                    "email address",
                    "mail",
                    "mail address",
                    "البريد الإلكتروني",
                    "الايميل",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "contactEmail",
                    0.99,
                    "Explicit email field",
                );
                continue;
            }

            if (
                [
                    "phone",
                    "mobile",
                    "mobile no.",
                    "mobile no",
                    "telephone",
                    "tel",
                    "tel1",
                    "tel2",
                    "business phone",
                    "رقم الهاتف",
                    "رقم الاتصال",
                    "الهاتف",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "phone",
                    0.99,
                    "Explicit phone field",
                );
                continue;
            }

            if (
                [
                    "job title",
                    "title",
                    "position",
                    "role",
                    "job",
                    "work",
                    "الوظيفة",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "contactTitle",
                    0.96,
                    "Explicit job/title field",
                );
                continue;
            }

            if (
                [
                    "business address",
                    "address",
                    "العنوان",
                ].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "address",
                    0.96,
                    "Explicit address field",
                );
                continue;
            }

            if (["city", "المدينة"].includes(normalized)) {
                addMapping(
                    mappings,
                    column,
                    "city",
                    0.99,
                    "Explicit city field",
                );
                continue;
            }

            if (["country", "الدولة"].includes(normalized)) {
                addMapping(
                    mappings,
                    column,
                    "country",
                    0.99,
                    "Explicit country field",
                );
                continue;
            }

            if (
                ["industry", "sector", "activity", "النشاط"].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "industry",
                    0.95,
                    "Explicit industry/activity field",
                );
                continue;
            }

            if (["website", "web", "url", "site"].includes(normalized)) {
                addMapping(
                    mappings,
                    column,
                    "website",
                    0.97,
                    "Explicit website field",
                );
                continue;
            }

            if (
                ["facebook", "facebook url", "facebook link"].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "sourceUrl",
                    0.95,
                    "Explicit social/source URL field",
                );
                continue;
            }

            if (
                ["serial", "no", "number", "id", "مسلسل"].includes(normalized)
            ) {
                addMapping(
                    mappings,
                    column,
                    "externalId",
                    0.94,
                    "Explicit row identifier",
                );
            }
        }

        // Value-based inference for headerless sources.
        if (
            mappings.length === 0 &&
            rows.length > 0 &&
            sourceType !== "EMAIL_LIST"
        ) {
            for (const column of columns) {
                const values = rows
                    .map(row => row[column])
                    .filter(value => clean(value) !== "");

                if (values.length === 0) continue;

                const emailRatio =
                    values.filter(isEmail).length / values.length;

                const phoneRatio =
                    values.filter(isPhone).length / values.length;

                const urlRatio =
                    values.filter(isUrl).length / values.length;

                const socialRatio =
                    values.filter(looksLikeSocialUrl).length / values.length;

                const companyRatio =
                    values.filter(looksLikeCompany).length / values.length;

                const personRatio =
                    values.filter(looksLikePersonName).length / values.length;

                if (emailRatio >= 0.7) {
                    addMapping(
                        mappings,
                        column,
                        "contactEmail",
                        Math.min(0.98, 0.80 + emailRatio * 0.18),
                        "Value pattern strongly matches email addresses",
                    );
                    continue;
                }

                if (phoneRatio >= 0.7) {
                    addMapping(
                        mappings,
                        column,
                        "phone",
                        Math.min(0.97, 0.80 + phoneRatio * 0.17),
                        "Value pattern strongly matches phone numbers",
                    );
                    continue;
                }

                if (socialRatio >= 0.7) {
                    addMapping(
                        mappings,
                        column,
                        "sourceUrl",
                        0.96,
                        "Value pattern strongly matches social profile URLs",
                    );
                    continue;
                }

                if (urlRatio >= 0.7) {
                    addMapping(
                        mappings,
                        column,
                        "website",
                        0.90,
                        "Value pattern strongly matches URLs",
                    );
                    continue;
                }

                if (companyRatio >= 0.55) {
                    addMapping(
                        mappings,
                        column,
                        "companyName",
                        0.78,
                        "Value pattern suggests company/business names",
                    );
                    continue;
                }

                if (personRatio >= 0.55) {
                    addMapping(
                        mappings,
                        column,
                        "contactName",
                        0.72,
                        "Value pattern suggests person names",
                    );
                }
            }
        }

        // Email-list sources: the values themselves are the data.
        if (sourceType === "EMAIL_LIST" && rows.length > 0) {
            const emailColumn = columns.find(column =>
                rows
                    .slice(0, 20)
                    .map(row => row[column])
                    .some(isEmail),
            );

            if (emailColumn) {
                addMapping(
                    mappings,
                    emailColumn,
                    "contactEmail",
                    0.99,
                    "Email-list values are direct contact emails",
                );
            }
        }

        if (sourceType === "HEADERLESS_OR_MALFORMED") {
            notes.push(
                "Schema inferred from observed values rather than trusted headers.",
            );
        }

        if (sourceType === "EMAIL_LIST") {
            notes.push(
                "Each valid email value is treated as a contact email; no company/contact identity is inferred.",
            );
        }

        const uniqueMappings = new Map<string, SourceColumnMapping>();

        for (const item of mappings) {
            if (!uniqueMappings.has(item.sourceColumn)) {
                uniqueMappings.set(item.sourceColumn, item);
            }
        }

        const finalMappings = Array.from(uniqueMappings.values());

        const confidence =
            finalMappings.length === 0
                ? 0
                : finalMappings.reduce(
                    (sum, item) => sum + item.confidence,
                    0,
                ) / finalMappings.length;

        const requiresReview =
            sourceType === "UNKNOWN" ||
            sourceType === "HEADERLESS_OR_MALFORMED" ||
            confidence < 0.80;

        return {
            sourceType,
            headerRowIndex:
                options?.headerRowIndex ?? null,
            dataStartRowIndex:
                options?.headerRowIndex !== null &&
                options?.headerRowIndex !== undefined
                    ? options.headerRowIndex + 1
                    : 0,
            columns,
            mappings: finalMappings,
            confidence,
            requiresReview,
            notes,
        };
    }
}

export const externalSourceSchemaMapper =
    new ExternalSourceSchemaMapper();
