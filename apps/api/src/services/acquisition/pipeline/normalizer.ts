/**
 * @file normalizer.ts
 * @description Cleans and standardizes raw lead data.
 */

import { RawRecord, NormalizedCompany, NormalizedContact } from '../types/acquisition-types';

export class NormalizationService {
    normalizeCompany(raw: RawRecord): NormalizedCompany {
        const name = raw.companyName || 'UNKNOWN';
        const website = raw.website || '';

        return {
            companyName: name,
            normalizedName: this.cleanCompanyName(name),
            website: website || null,
            domain: this.extractDomain(website),
            phone: this.normalizePhone(raw.phone),
            address: raw.address || null,
            city: raw.city || null,
            country: raw.country || null,
            source: raw.source,
            provider: raw.provider,
            sourceUrl: raw.sourceUrl || null
        };
    }

    normalizeContact(raw: RawRecord): NormalizedContact {
        return {
            name: raw.contactName || 'UNKNOWN',
            email: raw.email ? raw.email.toLowerCase().trim() : null,
            phone: this.normalizePhone(raw.phone),
            title: raw.contactTitle || null,
            source: raw.source
        };
    }

    private cleanCompanyName(name: string): string {
        return name
            .replace(/,?\s*(Ltd|L\.L\.C\.|Inc|Corp|S\.A\.|GmbH|Limited)/gi, '')
            .trim();
    }

    private extractDomain(url: string): string | null {
        if (!url) return null;
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return null;
        }
    }

    private normalizePhone(phone?: string): string | null {
        if (!phone) return null;
        // Simple normalization: remove non-digits and keep leading +
        return phone.replace(/[^\d+]/g, '');
    }
}

export const normalizer = new NormalizationService();
