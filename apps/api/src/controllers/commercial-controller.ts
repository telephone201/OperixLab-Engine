/**
 * @file commercial-controller.ts
 * @description Controller for the Commercial Management UI.
 * Exposes pricing, offers, proposals, and governance actions.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';
import {
    commercialFoundationService,
    CommercialPackageStatus
} from '../services/projects/commercial-foundation-service';
import { proposalService } from '../services/projects/proposal-service';
import { commercialGovernanceService } from '../services/projects/commercial-governance-service';
import { commercialStalenessService } from '../services/projects/commercial-staleness-service';

export class CommercialController {
    /**
     * GET /api/commercial/leads
     * Lists all leads with their commercial status for the main dashboard.
     */
    async getCommercialPipeline(req: Request, res: Response) {
        try {
            const packages = await db.commercial_packages.findMany({
                include: {
                    lead: true,
                    company: true
                },
                orderBy: { created_at: 'desc' }
            });

            return res.json({
                data: packages.map(pkg => ({
                    commercialPackageId: pkg.id,
                    leadId: pkg.lead_id,
                    companyName: pkg.company?.name || 'Unknown Company',
                    status: pkg.status,
                    updatedAt: pkg.updated_at
                }))
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/commercial/leads/:leadId
     * Fetches the full commercial context for a lead.
     */
    async getLeadCommercialContext(req: Request, res: Response) {
        try {
            const { leadId } = req.params;

            const pkg = await db.commercial_packages.findFirst({
                where: { lead_id: leadId },
                orderBy: { created_at: 'desc' }
            });

            if (!pkg) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'No commercial package found for this lead' }
                });
            }

            // Fetch related commercial artifacts
            const [pricing, offers, proposal] = await Promise.all([
                db.pricing_recommendations.findFirst({
                    where: { commercial_package_id: pkg.id },
                    orderBy: { pricing_version: 'desc' }
                }),
                db.offer_options.findMany({
                    where: { commercial_package_id: pkg.id }
                }),
                db.proposals.findFirst({
                    where: { commercial_package_id: pkg.id },
                    orderBy: { version: 'desc' }
                })
            ]);

            return res.json({
                data: {
                    package: pkg,
                    pricing: pricing,
                    offers: offers,
                    proposal: proposal
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/commercial/leads/:leadId/proposal-preview
     * Fetches the content of the latest proposal version.
     */
    async getProposalPreview(req: Request, res: Response) {
        try {
            const { leadId } = req.params;

            const proposal = await db.proposals.findFirst({
                where: { commercial_package_id: { lead_id: leadId } },
                orderBy: { version: 'desc' }
            });

            if (!proposal) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'No proposal found for this lead' }
                });
            }

            const version = await db.proposal_versions.findFirst({
                where: { proposal_id: proposal.id },
                orderBy: { version_number: 'desc' }
            });

            if (!version) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'No proposal version found' }
                });
            }

            // Check staleness
            const staleness = await commercialStalenessService.evaluateProposalStaleness(version.id);

            return res.json({
                data: {
                    content: version.content,
                    status: version.status,
                    staleness: staleness
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * POST /api/commercial/pricing/approve
     * Triggers human approval for pricing.
     */
    async approvePricing(req: Request, res: Response) {
        try {
            const { pricingId, userId, reason } = req.body;

            // We use the governance service to handle the approval logic
            await commercialGovernanceService.approveArtifact(req.body.approvalId, userId, reason);

            return res.json({ data: { status: 'APPROVED' } });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'APPROVAL_FAILED', message: error.message }
            });
        }
    }

    /**
     * POST /api/commercial/proposal/approve
     * Triggers human approval for the proposal.
     */
    async approveProposal(req: Request, res: Response) {
        try {
            const { approvalId, userId, reason } = req.body;
            await commercialGovernanceService.approveArtifact(approvalId, userId, reason);

            return res.json({ data: { status: 'APPROVED' } });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'APPROVAL_FAILED', message: error.message }
            });
        }
    }
}
