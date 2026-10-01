/**
 * @file public-proposal-controller.ts
 * @description Public, unauthenticated controller for client proposal links.
 *
 * Every rejection returns the same generic 404-shaped response so the
 * surface never reveals which validation condition failed.
 */

import { Request, Response } from 'express';

import { verifyProposalVersionSignature } from '../services/projects/proposal-share-link';
import { proposalPublicViewService } from '../services/projects/proposal-public-view-service';
import { proposalPublicResponseService } from '../services/projects/proposal-public-response-service';

const GENERIC_FAILURE = {
    error: {
        code: 'PROPOSAL_LINK_UNAVAILABLE',
        message: 'This proposal link is no longer valid.'
    }
};

export class PublicProposalController {
    async getProposal(req: Request, res: Response): Promise<Response> {
        const versionId = String(req.params.versionId ?? '').trim();
        const signature = typeof req.query.sig === 'string' ? req.query.sig : '';

        if (
            !versionId ||
            !verifyProposalVersionSignature(versionId, signature)
        ) {
            return res.status(404).json(GENERIC_FAILURE);
        }

        try {
            const view = await proposalPublicViewService.getPublicProposalView(versionId);

            return res.json({ data: view });
        } catch {
            return res.status(404).json(GENERIC_FAILURE);
        }
    }

    async submitResponse(req: Request, res: Response): Promise<Response> {
        const versionId = String(req.params.versionId ?? '').trim();
        const signature = typeof req.query.sig === 'string' ? req.query.sig : '';
        const action = req.body?.action;
        const message = typeof req.body?.message === 'string' ? req.body.message : undefined;

        if (
            !versionId ||
            !verifyProposalVersionSignature(versionId, signature) ||
            (action !== 'ACCEPT' && action !== 'REQUEST_CHANGES')
        ) {
            return res.status(404).json(GENERIC_FAILURE);
        }

        try {
            const result = await proposalPublicResponseService.recordResponse({
                versionId,
                action,
                message
            });

            return res.json({
                data: { success: true, status: result.status }
            });
        } catch {
            // Same generic failure shape as the GET surface: invalid/expired/
            // superseded/unavailable proposals and empty messages are
            // indistinguishable from the outside. A reached-but-failed
            // submission (e.g. transient error) would also land here; the
            // client page presents a retryable error either way.
            return res.status(404).json(GENERIC_FAILURE);
        }
    }
}

export const publicProposalController = new PublicProposalController();
