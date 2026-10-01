import axios, { AxiosError, type AxiosResponse } from 'axios';

import { config } from '../../config/config-manager';
import type {
    DiscoveryProvider,
    DiscoveryRequest,
    DiscoveryResult
} from './discovery-provider';
import {
    mapApifyActorItem,
    type ApifyActorItem
} from './apify-lead-mapper';

const MAX_RESULTS = 25;
const REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 1_000;

interface ApifyRunResponse {
    data?: unknown;
}

function sanitizeError(error: unknown): Error {
    if (error instanceof AxiosError) {
        if (error.response?.status === 401 || error.response?.status === 403) {
            return new Error('Apify authentication failed');
        }

        if (error.response?.status === 429) {
            return new Error('Apify rate limit exceeded');
        }

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return new Error('Apify request timed out');
        }

        return new Error(
            `Apify request failed with HTTP ${error.response?.status ?? 'unknown'}`
        );
    }

    if (error instanceof Error) {
        return new Error(
            error.message
                .replace(/APIFY_TOKEN/gi, '[REDACTED]')
                .replace(/token=[^&\s]+/gi, 'token=[REDACTED]')
        );
    }

    return new Error('Apify discovery failed');
}

function buildInput(
    request: DiscoveryRequest
): Record<string, unknown> {
    const searchTerms =
        request.searchTerms && request.searchTerms.length > 0
            ? request.searchTerms
            : [request.instruction];

    const configuredLocation = config.get('apifyDefaultLocation');

    const location =
        request.locationQuery?.trim() ||
        configuredLocation?.trim() ||
        null;

    return {
        searchStringsArray: searchTerms,
        ...(location ? { locationQuery: location } : {}),
        maxCrawledPlacesPerSearch: MAX_RESULTS,
        language: 'en',
        website: 'withWebsite'
    };
}

export class ApifyDiscoveryProvider implements DiscoveryProvider {
    async discover(
        request: DiscoveryRequest
    ): Promise<DiscoveryResult> {
        const token = config.get('apifyToken');
        const actorId = config.get('apifyActorId');

        if (!token) {
            throw new Error('Apify token is not configured');
        }

        if (!actorId) {
            throw new Error('Apify actor ID is not configured');
        }

        const encodedActorId = encodeURIComponent(actorId);
        const url =
            `https://api.apify.com/v2/acts/${encodedActorId}` +
            `/run-sync-get-dataset-items`;

        const input = buildInput(request);

        let response: AxiosResponse<unknown> | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                response = await axios.post<unknown>(
                    url,
                    input,
                    {
                        params: {
                            token
                        },
                        timeout: REQUEST_TIMEOUT_MS,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                break;
            } catch (error: unknown) {
                const status =
                    error instanceof AxiosError
                        ? error.response?.status
                        : undefined;

                if (status === 429 && attempt === 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, RETRY_DELAY_MS)
                    );
                    continue;
                }

                throw sanitizeError(error);
            }
        }

        const rawItems = response?.data;

        if (!Array.isArray(rawItems)) {
            throw new Error('Apify returned an invalid dataset response');
        }

        const leads = rawItems
            .slice(0, MAX_RESULTS)
            .map((item) =>
                item && typeof item === 'object'
                    ? mapApifyActorItem(item as ApifyActorItem)
                    : null
            )
            .filter((lead): lead is NonNullable<typeof lead> => lead !== null);

        return {
            leads,
            provider: 'APIFY'
        };
    }
}

export const apifyDiscoveryProvider = new ApifyDiscoveryProvider();


