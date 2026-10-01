/**
 * @file proposal-public-view-service.ts
 * @description Client-safe proposal view for the public share link.
 *
 * Resolves a proposal version to the minimal client-safe payload for the
 * public proposal page. Enforces the Sales MVP access contract:
 *   - the proposal version exists
 *   - it belongs to the CURRENT approved proposal (status APPROVED)
 *   - it is the latest version of that proposal
 *   - the proposal has not expired (valid_until, when present)
 *
 * All rejections collapse to a single generic error so the public surface
 * never reveals which validation condition failed.
 */

import { db } from '../../lib/db';
import { ProposalStatus } from './proposal-types';
import type { ProposalContent } from './proposal-types';

export type ProposalViewLanguage = 'ar' | 'en';

export interface PublicProposalView {
    companyName: string;
    offerName: string;
    proposalVersionId: string;
    validUntil: string | null;
    /** UI language for the response CTA ('ar' | 'en'). Defaults to 'en'. */
    language: ProposalViewLanguage;
    content: ProposalContent;
}

const GENERIC_REJECTION = new Error('PROPOSAL_LINK_UNAVAILABLE');

export class ProposalPublicViewService {
    async getPublicProposalView(versionId: string): Promise<PublicProposalView> {
        const versionRows = await db.query(
            `SELECT pv.id, pv.proposal_id, pv.version_number, pv.content, pv.status
             FROM proposal_versions pv
             WHERE pv.id = $1
             LIMIT 1`,
            [versionId]
        );

        const version = versionRows.rows[0];

        if (!version) {
            throw GENERIC_REJECTION;
        }

        const proposalRows = await db.query(
            `SELECT p.id, p.status, p.valid_until
             FROM proposals p
             WHERE p.id = $1
             LIMIT 1`,
            [version.proposal_id]
        );

        const proposal = proposalRows.rows[0];

        if (!proposal || String(proposal.status) !== ProposalStatus.APPROVED) {
            throw GENERIC_REJECTION;
        }

        // The requested version must be the CURRENT (latest) version of the
        // approved proposal. Superseded versions are rejected.
        const latestVersionRows = await db.query(
            `SELECT id
             FROM proposal_versions
             WHERE proposal_id = $1
             ORDER BY version_number DESC
             LIMIT 1`,
            [version.proposal_id]
        );

        if (
            latestVersionRows.rows.length !== 1 ||
            String(latestVersionRows.rows[0].id) !== String(version.id)
        ) {
            throw GENERIC_REJECTION;
        }

        if (proposal.valid_until) {
            const validUntil = new Date(proposal.valid_until);

            if (!Number.isNaN(validUntil.getTime()) && validUntil.getTime() < Date.now()) {
                throw GENERIC_REJECTION;
            }
        }

        const content = this.parseClientSafeContent(version.content);

        if (!content) {
            throw GENERIC_REJECTION;
        }

        const companyName = await this.resolveCompanyName(version.proposal_id);

        return {
            companyName,
            offerName: this.resolveOfferName(content),
            proposalVersionId: String(version.id),
            validUntil: proposal.valid_until
                ? new Date(proposal.valid_until).toISOString()
                : null,
            // Smallest language resolution: an explicit 'language' field on
            // the persisted proposal content when present ('ar' | 'en');
            // otherwise English. Business content itself is never translated.
            language: this.resolveLanguage(content),
            content
        };
    }

    /**
     * Accepts the persisted content (JSONB object or JSON string) and keeps
     * only the client-safe fields defined by ProposalContent. Internal-only
     * fields are dropped by projection, never by trust in the stored shape.
     */
    private parseClientSafeContent(raw: unknown): ProposalContent | null {
        let parsed: unknown = raw;

        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
            } catch {
                return null;
            }
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const source = parsed as Record<string, unknown>;
        const readString = (key: string): string =>
            typeof source[key] === 'string' ? (source[key] as string) : '';

        const scope = source.scope;
        const readScopeList = (key: string): string[] =>
            scope && typeof scope === 'object' && Array.isArray((scope as any)[key])
                ? ((scope as any)[key] as unknown[]).filter(
                      (item): item is string => typeof item === 'string'
                  )
                : [];

        const commercialOptions = Array.isArray(source.commercialOptions)
            ? (source.commercialOptions as unknown[])
                  .filter((item): item is Record<string, unknown> =>
                      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
                  )
                  .map((option) => ({
                      name: typeof option.name === 'string' ? option.name : '',
                      setupFee: typeof option.setupFee === 'number' ? option.setupFee : null,
                      recurringFee: typeof option.recurringFee === 'number' ? option.recurringFee : null,
                      recommendedPrice:
                          typeof option.recommendedPrice === 'number' ? option.recommendedPrice : null,
                      currency: typeof option.currency === 'string' ? option.currency : '',
                      billingCycle: typeof option.billingCycle === 'string' ? option.billingCycle : ''
                  }))
            : [];

        return {
            introduction: readString('introduction'),
            companyUnderstanding: readString('companyUnderstanding'),
            painSummary: readString('painSummary'),
            requirementsSummary: readString('requirementsSummary'),
            recommendedSolution: readString('recommendedSolution'),
            solutionExplanation: readString('solutionExplanation'),
            expectedImpact: readString('expectedImpact'),
            demo: readString('demo'),
            scope: {
                included: readScopeList('included'),
                optional: readScopeList('optional'),
                outOfScope: readScopeList('outOfScope')
            },
            commercialOptions,
            terms: readString('terms'),
            assumptions: readString('assumptions'),
            faq: readString('faq'),
            nextSteps: readString('nextSteps'),
            contact: readString('contact')
        };
    }

    /**
     * Reads the optional 'language' field from persisted content. Anything
     * other than 'ar' resolves to 'en' — no translation of business content
     * happens in this milestone.
     */
    private resolveLanguage(content: ProposalContent & { language?: unknown }): ProposalViewLanguage {
        const raw = (content as unknown as Record<string, unknown>).language;
        return raw === 'ar' ? 'ar' : 'en';
    }

    private resolveOfferName(content: ProposalContent): string {
        const option = content.commercialOptions.find(
            (candidate) => candidate.name && candidate.name.trim().length > 0
        );

        return option?.name ?? 'Automation Proposal';
    }

    private async resolveCompanyName(proposalId: string): Promise<string> {
        const result = await db.query(
            `SELECT c.name
             FROM proposals p
             JOIN commercial_packages cp ON cp.id = p.commercial_package_id
             JOIN companies c ON c.id = cp.company_id
             WHERE p.id = $1
             LIMIT 1`,
            [proposalId]
        );

        const name = result.rows[0]?.name;

        return typeof name === 'string' && name.trim().length > 0 ? name : 'your organization';
    }
}

export const proposalPublicViewService = new ProposalPublicViewService();
