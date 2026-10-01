/**
 * @file discovery-provider.ts
 * @description Provider boundary for Chat v1 lead discovery.
 *
 * Chat orchestration depends on this contract rather than a concrete
 * discovery implementation, so real discovery providers can be added later
 * without changing the Chat orchestration layer.
 */

export interface DiscoveredLead {
    name: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    source: string;
    metadata?: Record<string, any>;
}

export interface DiscoveryRequest {
    instruction: string;
    searchTerms?: string[];
    locationQuery?: string | null;
}

export interface DiscoveryResult {
    leads: DiscoveredLead[];
    provider: string;
}

import { SeedDiscoveryProvider } from './seed-discovery-provider';
import { ApifyDiscoveryProvider } from './apify-discovery-provider';
import { config } from '../../config/config-manager';

export interface DiscoveryProvider {
    discover(request: DiscoveryRequest): Promise<DiscoveryResult>;
}

/**
 * Chat v1 provider.
 *
 * This provider intentionally returns no leads until a real discovery source
 * is connected. It keeps the behavior honest and prevents Chat from
 * fabricating businesses.
 */
export class ManualDiscoveryProvider implements DiscoveryProvider {
    async discover(
        _request: DiscoveryRequest
    ): Promise<DiscoveryResult> {
        return {
            leads: [],
            provider: 'MANUAL'
        };
    }
}

export const discoveryProvider: DiscoveryProvider =
    config.get('chatDiscoveryProvider') === 'APIFY'
        ? new ApifyDiscoveryProvider()
        : config.get('chatDiscoveryProvider') === 'SEED'
            ? new SeedDiscoveryProvider()
            : new ManualDiscoveryProvider();



