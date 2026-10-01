/**
 * @file proposal-share-link.ts
 * @description Stateless HMAC share-link signing for client proposal viewing.
 *
 * The link binds an HMAC-SHA256 signature to a single proposal version id
 * using the existing application secret (config-manager APP_SECRET). There
 * is no link table and no client account: possession of a correctly signed
 * link for a currently-approved, unexpired proposal version is the access
 * mechanism (Sales MVP milestone 1).
 */

import crypto from 'crypto';

import { config } from '../../config/config-manager';

const SIGNATURE_MESSAGE_PREFIX = 'proposal-share:v1';

/**
 * Computes the base64url HMAC-SHA256 signature for a proposal version id.
 */
export function signProposalVersionId(versionId: string): string {
    const secret = config.get('appSecret');

    if (!secret) {
        throw new Error('PROPOSAL_SHARE_LINK_SECRET_MISSING: APP_SECRET is required to mint client proposal links.');
    }

    return crypto
        .createHmac('sha256', secret)
        .update(`${SIGNATURE_MESSAGE_PREFIX}:${versionId}`)
        .digest('base64url');
}

/**
 * Timing-safe verification of a client-provided signature against the
 * expected signature for the proposal version id. Any malformed or
 * non-matching signature fails closed.
 */
export function verifyProposalVersionSignature(
    versionId: string,
    signature: string | undefined | null
): boolean {
    if (!signature || typeof signature !== 'string') {
        return false;
    }

    const expected = signProposalVersionId(versionId);

    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (provided.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(provided, expectedBuffer);
}
