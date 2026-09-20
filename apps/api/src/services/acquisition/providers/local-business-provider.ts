/**
 * @file local-business-provider.ts
 * @description Provider for discovering local businesses.
 * Implements a manual/local mode for Zero Cost compliance.
 */

import { ILocalBusinessProvider, BusinessQuery, BusinessLead, ProviderResult } from '../../../providers/provider-interfaces';

export class ManualLocalBusinessProvider implements ILocalBusinessProvider {
    name = 'ManualLocalBusinessProvider';

    async findBusinesses(query: BusinessQuery): Promise<ProviderResult<BusinessLead[]>> {
        // In Zero Cost Mode, we provide a mechanism for manual lead entry
        // or reading from a local pre-approved list.

        // This is a stub for manual input. In a real scenario, this would
        // either return an empty list (indicating manual entry required)
        // or pull from a local seed file.

        return {
            success: true,
            provider: this.name,
            latencyMs: 5,
            data: [] // Manual entry is handled via the API/UI and pushed to the pipeline
        };
    }
}

export const manualLocalBusinessProvider = new ManualLocalBusinessProvider();
