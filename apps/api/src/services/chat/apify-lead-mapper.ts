import type { DiscoveredLead } from './discovery-provider';

export interface ApifyActorItem {
    title?: unknown;
    name?: unknown;
    website?: unknown;
    url?: unknown;
    phone?: unknown;
    phoneNumber?: unknown;
    address?: unknown;
    email?: unknown;
    [key: string]: unknown;
}

function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWebsite(value: unknown): string | undefined {
    const raw = readString(value);
    if (!raw) return undefined;

    try {
        const url = new URL(
            /^https?:\/\//i.test(raw)
                ? raw
                : `https://${raw}`
        );

        return url.toString();
    } catch {
        return undefined;
    }
}

export function mapApifyActorItem(
    item: ApifyActorItem
): DiscoveredLead | null {
    const name =
        readString(item.title) ||
        readString(item.name);

    if (!name) {
        return null;
    }

    const website = normalizeWebsite(
        item.website ?? item.url
    );

    const phone =
        readString(item.phone) ||
        readString(item.phoneNumber);

    const address = readString(item.address);
    const email = readString(item.email);

    return {
        name,
        website,
        phone,
        email,
        address,
        source: 'APIFY',
        metadata: {
            provider: 'APIFY'
        }
    };
}
