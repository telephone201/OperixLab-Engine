/**
 * @file mint-proposal-client-link.ts
 * @description One-off operator helper: prints the signed public client URL
 * for a proposal version (Sales MVP milestone 1).
 *
 * Usage:
 *   npx ts-node scripts/mint-proposal-client-link.ts <proposalVersionId> [webBaseUrl]
 *
 * The signature uses APP_SECRET (config-manager). The web base URL defaults
 * to NEXT_PUBLIC_APP_BASE_URL or http://localhost:3100 — never hard-coded to
 * a production domain.
 */

import { signProposalVersionId } from '../src/services/projects/proposal-share-link';

async function main(): Promise<void> {
    const versionId = process.argv[2]?.trim() ?? '';
    const webBaseUrl = (
        process.argv[3]?.trim() ||
        process.env.NEXT_PUBLIC_APP_BASE_URL ||
        'http://localhost:3100'
    ).replace(/\/+$/, '');

    if (!versionId) {
        console.error('Usage: npx ts-node scripts/mint-proposal-client-link.ts <proposalVersionId> [webBaseUrl]');
        process.exitCode = 1;
        return;
    }

    let signature: string;

    try {
        signature = signProposalVersionId(versionId);
    } catch (error: any) {
        console.error(error?.message ?? String(error));
        process.exitCode = 1;
        return;
    }

    console.log('CLIENT PROPOSAL LINK:');
    console.log(`${webBaseUrl}/proposal/${versionId}?sig=${signature}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
