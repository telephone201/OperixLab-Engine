import type {
    DiscoveryProvider,
    DiscoveryRequest,
    DiscoveryResult,
    DiscoveredLead
} from './discovery-provider';

const SEED_LEADS: DiscoveredLead[] = [
    {
        name: 'Seed Smile Dental Clinic',
        website: 'https://seed-smile.test',
        phone: '+201000000101',
        email: 'info@seed-smile.test',
        address: '1 Seed St, Cairo',
        source: 'SEED',
        metadata: { seed: true }
    },
    {
        name: 'Seed Smile Dental Branch',
        website: 'https://seed-smile.test',
        phone: '+201000000102',
        email: 'branch@seed-smile.test',
        address: '2 Seed St, Cairo',
        source: 'SEED',
        metadata: { seed: true }
    },
    {
        name: 'Seed Physio Studio',
        website: 'https://seed-physio.test',
        phone: '+201000000103',
        email: 'info@seed-physio.test',
        address: '3 Seed St, Giza',
        source: 'SEED',
        metadata: { seed: true }
    },
    {
        name: 'Seed Phone Only Garage',
        phone: '+201000000104',
        address: '4 Seed St, Cairo',
        source: 'SEED',
        metadata: { seed: true }
    }
];

export class SeedDiscoveryProvider implements DiscoveryProvider {
    async discover(_request: DiscoveryRequest): Promise<DiscoveryResult> {
        return {
            leads: SEED_LEADS.map((lead) => ({
                ...lead,
                metadata: lead.metadata
                    ? { ...lead.metadata }
                    : undefined
            })),
            provider: 'SEED'
        };
    }
}
