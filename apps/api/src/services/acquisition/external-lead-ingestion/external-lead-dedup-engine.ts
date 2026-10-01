export type DedupDecision =
    | "UNIQUE"
    | "DUPLICATE"
    | "REVIEW_REQUIRED";

export type DedupMatchType =
    | "EMAIL"
    | "PHONE"
    | "DOMAIN"
    | "COMPANY_AND_CONTACT_NAME"
    | "COMPANY_NAME";

export interface DedupLeadInput {
    companyName?: string | null;
    normalizedCompanyName?: string | null;
    domain?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    phone?: string | null;
}

export interface ExistingCompanyCandidate {
    id: string;
    name: string;
    normalizedName?: string | null;
    domain?: string | null;
    phone?: string | null;
}

export interface ExistingContactCandidate {
    id: string;
    companyId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
}

export interface DedupCandidate {
    company?: ExistingCompanyCandidate | null;
    contact?: ExistingContactCandidate | null;
}

export interface DedupResult {
    decision: DedupDecision;
    matchType: DedupMatchType | null;
    candidate: DedupCandidate | null;
    reason: string;
}

function clean(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const normalized = String(value)
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    return normalized || null;
}

function normalizeEmail(value: unknown): string | null {
    return clean(value);
}

function normalizePhone(value: unknown): string | null {
    const normalized = String(value ?? "").replace(/\D/g, "");

    return normalized || null;
}

function normalizeDomain(value: unknown): string | null {
    const normalized = clean(value);

    if (!normalized) {
        return null;
    }

    return normalized
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();
}

function normalizeName(value: unknown): string | null {
    return clean(value);
}

function getContactFullName(
    candidate: ExistingContactCandidate,
): string | null {
    if (candidate.fullName) {
        return normalizeName(candidate.fullName);
    }

    const firstName = normalizeName(candidate.firstName);
    const lastName = normalizeName(candidate.lastName);

    return [firstName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
}

export function deduplicateExternalLead(
    input: DedupLeadInput,
    candidates: DedupCandidate[],
): DedupResult {
    const email = normalizeEmail(input.contactEmail);
    const phone = normalizePhone(input.phone);
    const domain = normalizeDomain(input.domain);
    const companyName = normalizeName(
        input.normalizedCompanyName ?? input.companyName,
    );
    const contactName = normalizeName(input.contactName);

    for (const candidate of candidates) {
        const candidateEmail = normalizeEmail(candidate.contact?.email);

        if (email && candidateEmail && email === candidateEmail) {
            return {
                decision: "DUPLICATE",
                matchType: "EMAIL",
                candidate,
                reason: "Contact email matches an existing contact.",
            };
        }
    }

    for (const candidate of candidates) {
        const candidatePhone = normalizePhone(
            candidate.contact?.phone ?? candidate.company?.phone,
        );

        if (phone && candidatePhone && phone === candidatePhone) {
            return {
                decision: "DUPLICATE",
                matchType: "PHONE",
                candidate,
                reason: "Phone number matches an existing contact or company.",
            };
        }
    }

    for (const candidate of candidates) {
        const candidateDomain = normalizeDomain(candidate.company?.domain);

        if (domain && candidateDomain && domain === candidateDomain) {
            return {
                decision: "DUPLICATE",
                matchType: "DOMAIN",
                candidate,
                reason: "Company domain matches an existing company.",
            };
        }
    }

    for (const candidate of candidates) {
        const candidateCompanyName = normalizeName(
            candidate.company?.normalizedName ?? candidate.company?.name,
        );
        const candidateContactName = candidate.contact
            ? getContactFullName(candidate.contact)
            : null;

        if (
            companyName &&
            contactName &&
            candidateCompanyName === companyName &&
            candidateContactName === contactName
        ) {
            return {
                decision: "DUPLICATE",
                matchType: "COMPANY_AND_CONTACT_NAME",
                candidate,
                reason: "Company name and contact name both match.",
            };
        }
    }

    for (const candidate of candidates) {
        const candidateCompanyName = normalizeName(
            candidate.company?.normalizedName ?? candidate.company?.name,
        );

        if (
            companyName &&
            candidateCompanyName &&
            companyName === candidateCompanyName
        ) {
            return {
                decision: "REVIEW_REQUIRED",
                matchType: "COMPANY_NAME",
                candidate,
                reason: "Company name matches, but there is not enough evidence for an automatic duplicate decision.",
            };
        }
    }

    return {
        decision: "UNIQUE",
        matchType: null,
        candidate: null,
        reason: "No duplicate evidence matched the available candidates.",
    };
}
