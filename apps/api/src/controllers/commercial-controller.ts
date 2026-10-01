/**
 * @file commercial-controller.ts
 * @description Controller for the Commercial Management UI.
 * Exposes pricing, offers, proposals, and governance actions.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';
import { commercialFoundationService } from '../services/projects/commercial-foundation-service';
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
                orderBy: { created_at: 'desc' }
            });

            const data = await Promise.all(
                packages.map(async (pkg) => {
                    const company = pkg.company_id
                        ? await db.companies.findUnique({
                            where: { id: pkg.company_id }
                        })
                        : null;

                    return {
                        commercialPackageId: pkg.id,
                        leadId: pkg.lead_id,
                        companyName: company?.name || 'Unknown Company',
                        status: pkg.status,
                        updatedAt: pkg.updated_at
                    };
                })
            );

            return res.json({ data });
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

            // Map database snake_case fields to the frontend commercial API contract.
            const pricingData = pricing
                ? {
                    pricingId: pricing.id,
                    commercialPackageId: pricing.commercial_package_id,
                    solutionArchitectureId: pricing.solution_architecture_id,
                    solutionVersionId: pricing.solution_version_id,
                    pricingVersion: pricing.pricing_version,
                    currency: pricing.currency,
                    marketRangeMin: pricing.market_range_min,
                    marketRangeMax: pricing.market_range_max,
                    costFloor: pricing.cost_floor,
                    targetPrice: pricing.target_price,
                    recommendedPrice: pricing.recommended_price,
                    pricingConfidence: pricing.pricing_confidence,
                    marketDataConfidence: pricing.market_data_confidence,
                    reasoning: pricing.reasoning,
                    assumptions: pricing.assumptions,
                    riskFactors: pricing.risk_factors,
                    pricingEvidenceReference: pricing.pricing_evidence_reference,
                    status: pricing.status,
                    createdAt: pricing.created_at,
                    createdBy: pricing.created_by
                }
                : null;

            const offersData = offers.map((offer: any) => ({
                offerId: offer.id,
                commercialPackageId: offer.commercial_package_id,
                name: offer.name,
                description: offer.description,
                includedScope: offer.included_scope,
                optionalScope: offer.optional_scope,
                outOfScope: offer.out_of_scope,
                setupFee: offer.setup_fee,
                recurringFee: offer.recurring_fee,
                currency: offer.currency,
                billingCycle: offer.billing_cycle,
                minimumCommitmentMonths: offer.minimum_commitment_months,
                paymentTerms: offer.payment_terms,
                setupPaymentPercentage: offer.setup_payment_percentage,
                setupBalanceTerms: offer.setup_balance_terms,
                implementationStartCondition: offer.implementation_start_condition,
                cancellationTerms: offer.cancellation_terms,
                scopeChangeTerms: offer.scope_change_terms,
                supportTerms: offer.support_terms,
                validUntil: offer.valid_until,
                status: offer.status,
                version: offer.version,
                createdAt: offer.created_at,
                createdBy: offer.created_by
            }));

            const proposalData = proposal
                ? {
                    proposalId: proposal.id,
                    commercialPackageId: proposal.commercial_package_id,
                    status: proposal.status,
                    version: proposal.version,
                    createdAt: proposal.created_at,
                    updatedAt: proposal.updated_at,
                    createdBy: proposal.created_by,
                    validUntil: proposal.valid_until
                }
                : null;

            return res.json({
                data: {
                    package: pkg,
                    pricing: pricingData,
                    offers: offersData,
                    proposal: proposalData
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
            const { pricingId, reason } = req.body;
            const userId = req.user!.id;

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
            const { approvalId, reason } = req.body;
            const userId = req.user!.id;
            await commercialGovernanceService.approveArtifact(approvalId, userId, reason);

            return res.json({ data: { status: 'APPROVED' } });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'APPROVAL_FAILED', message: error.message }
            });
        }
    }
}
