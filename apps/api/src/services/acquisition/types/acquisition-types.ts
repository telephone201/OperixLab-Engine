/**
 * @file acquisition-types.ts
 * @description Core types for the Lead Acquisition engine.
 */

export enum LeadState {
    DISCOVERED = 'DISCOVERED',
    IMPORTED = 'IMPORTED',
    NORMALIZED = 'NORMALIZED',
    VALIDATED = 'VALIDATED',
    INVALID = 'INVALID',
    DUPLICATE = 'DUPLICATE',
    READY_FOR_RESEARCH = 'READY_FOR_RESEARCH'
}

export enum DuplicateStatus {
    CANONICAL = 'CANONICAL',
    DUPLICATE = 'DUPLICATE',
    POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE'
}

export interface RawRecord {
    companyName: string;
    website?: string;
    domain?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    email?: string;
    contactName?: string;
    contactTitle?: string;
    source: string;
    provider: string;
    sourceUrl?: string;
    rawMetadata: Record<string, any>;
}

export interface NormalizedCompany {
    companyName: string;
    normalizedName: string;
    website: string | null;
    domain: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    source: string;
    provider: string;
    sourceUrl: string | null;
}

export interface NormalizedContact {
    name: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    source: string;
}

export interface ValidatedLead {
    company: NormalizedCompany;
    contact?: NormalizedContact;
    status: LeadState;
    qualitySignals: {
        hasWebsite: boolean;
        hasEmail: boolean;
        hasPhone: boolean;
        hasAddress: boolean;
        hasIndustry: boolean;
        hasContact: boolean;
    };
}
