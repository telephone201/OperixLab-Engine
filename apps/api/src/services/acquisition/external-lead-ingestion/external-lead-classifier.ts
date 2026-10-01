export type ExternalLeadRecordType =
    | "BUSINESS"
    | "PERSON_OR_CONTACT"
    | "UNKNOWN";

function hasValue(
    row: Record<string, unknown>,
    aliases: string[],
): boolean {
    const keys = Object.keys(row).map((key) => key.trim().toLowerCase());

    return aliases.some((alias) =>
        keys.includes(alias.trim().toLowerCase()),
    );
}

export function classifyExternalLeadRecord(
    row: Record<string, unknown>,
): ExternalLeadRecordType {
    const hasCompanyField = hasValue(row, [
        "Company Name",
        "Company",
        "Business Name",
        "Business",
    ]);

    const hasContactField = hasValue(row, [
        "Name",
        "Full Name",
        "Customer Name",
        "Contact Name",
        "Email",
        "E-mail",
        "Phone",
        "Mobile",
        "Mobile No.",
        "Tel",
        "Telephone",
    ]);

    if (hasCompanyField) {
        return "BUSINESS";
    }

    if (hasContactField) {
        return "PERSON_OR_CONTACT";
    }

    return "UNKNOWN";
}
