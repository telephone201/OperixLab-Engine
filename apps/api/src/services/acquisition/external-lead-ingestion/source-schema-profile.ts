export type ExternalSourceType =
    | "BUSINESS_DATABASE"
    | "CONTACT_DATABASE"
    | "EMAIL_LIST"
    | "HEADERLESS_OR_MALFORMED"
    | "STRUCTURED_DATA_EMBEDDED_HEADER"
    | "POSSIBLE_BUSINESS_DATABASE"
    | "MIXED_OR_MULTI_SECTION"
    | "UNKNOWN";

export type ExternalField =
    | "companyName"
    | "contactName"
    | "firstName"
    | "lastName"
    | "contactEmail"
    | "contactTitle"
    | "phone"
    | "address"
    | "city"
    | "country"
    | "industry"
    | "website"
    | "sourceUrl"
    | "location"
    | "externalId"
    | "ignore";

export interface SourceColumnMapping {
    sourceColumn: string;
    targetField: ExternalField;
    confidence: number;
    reason: string;
}

export interface SourceSchemaProfile {
    sourceType: ExternalSourceType;
    headerRowIndex: number | null;
    dataStartRowIndex: number;
    columns: string[];
    mappings: SourceColumnMapping[];
    confidence: number;
    requiresReview: boolean;
    notes: string[];
}
