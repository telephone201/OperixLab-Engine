import type { NormalizedExternalLead } from "./external-lead-normalizer";
import type { ExternalLeadRecordType } from "./external-lead-classifier";

export type ExternalLeadValidationStatus =
    | "VALID"
    | "REVIEW_REQUIRED"
    | "REJECTED";

export interface ExternalLeadValidationResult {
    status: ExternalLeadValidationStatus;
    errors: string[];
    warnings: string[];
}

function hasText(value: string | null | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikePhone(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
}

export function validateExternalLead(
    recordType: ExternalLeadRecordType,
    normalized: NormalizedExternalLead | null,
): ExternalLeadValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (recordType === "UNKNOWN") {
        return {
            status: "REJECTED",
            errors: ["Record could not be classified."],
            warnings: [],
        };
    }

    if (!normalized) {
        return {
            status: "REJECTED",
            errors: ["Normalized record is missing."],
            warnings: [],
        };
    }

    if (!hasText(normalized.contactName) && !hasText(normalized.companyName)) {
        errors.push("No company name or contact name was found.");
    }

    if (hasText(normalized.contactEmail) &&
        !looksLikeEmail(normalized.contactEmail!)) {
        errors.push("Contact email has an invalid format.");
    }

    if (hasText(normalized.phone) &&
        !looksLikePhone(normalized.phone!)) {
        errors.push("Phone number does not contain a plausible number of digits.");
    }

    if (recordType === "BUSINESS") {
        if (!hasText(normalized.companyName)) {
            errors.push("Business record has no company name.");
        }

        if (!hasText(normalized.phone) &&
            !hasText(normalized.contactEmail) &&
            !hasText(normalized.website)) {
            warnings.push(
                "Business has no phone, email, or website; identity may be difficult to verify."
            );
        }
    }

    if (recordType === "PERSON_OR_CONTACT") {
        if (!hasText(normalized.companyName)) {
            warnings.push(
                "Person/contact record has no associated company."
            );
        }

        if (!hasText(normalized.phone) &&
            !hasText(normalized.contactEmail)) {
            errors.push(
                "Person/contact has neither phone nor email."
            );
        }
    }

    if (errors.length > 0) {
        return {
            status: "REJECTED",
            errors,
            warnings,
        };
    }

    if (recordType === "PERSON_OR_CONTACT" &&
        !hasText(normalized.companyName)) {
        return {
            status: "REVIEW_REQUIRED",
            errors: [],
            warnings,
        };
    }

    return {
        status: "VALID",
        errors: [],
        warnings,
    };
}
