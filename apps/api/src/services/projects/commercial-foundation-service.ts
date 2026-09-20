/**
 * @file commercial-foundation-service.ts
 * @description Manages the foundation of the commercialization engine, including packages, pricing, and offers.
 */

import { db } from '../../lib/db';
import {
    CommercialPackage,
    CommercialPackageStatus,
    PricingRecommendation,
    PricingStatus,
    OfferOption,
    OfferStatus,
    BillingCycle
} from './commercial-types';
import { auditLogger } from '../../core/logging/audit-logger';

export class CommercialFoundationService {
    /**
     * Creates a new commercial package for a lead.
     * Implements idempotency: if a package for the same lead and solution version already exists in DRAFT, it returns that.
     */
    async createCommercialPackage(params: {
        leadId: string;
        companyId: string;
        contactId: string;
        solutionArchitectureId: string;
        solutionVersionId: string;
        userId: string;
        currency?: string;
    }): Promise<CommercialPackage> {
        // Idempotency Check
        const existing = await db.commercial_packages.findFirst({
            where: {
                lead_id: params.leadId,
                solution_version_id: params.solutionVersionId,
                status: CommercialPackageStatus.DRAFT
            }
        });

        if (existing) {
            return this.mapToDomain(existing);
        }

        const packageId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const pkg = await db.commercial_packages.create({
            data: {
                id: packageId,
                lead_id: params.leadId,
                company_id: params.companyId,
                contact_id: params.contactId,
                solution_architecture_id: params.solutionArchitectureId,
                solution_version_id: params.solutionVersionId,
                status: CommercialPackageStatus.DRAFT,
                currency: params.currency || 'USD',
                created_by: params.userId,
                version: 1
            }
        });

        await auditLogger.log({
            action: 'COMMERCIAL_PACKAGE_CREATED',
            entityType: 'CommercialPackage',
            entityId: packageId,
            details: { leadId: params.leadId, solutionVersionId: params.solutionVersionId }
        });

        return this.mapToDomain(pkg);
    }

    /**
     * Creates a pricing recommendation.
     */
    async createPricingRecommendation(params: {
        commercialPackageId: string;
        solutionArchitectureId: string;
        solutionVersionId: string;
        recommendedPrice: number;
        costFloor: number;
        targetPrice: number;
        userId: string;
        currency?: string;
        reasoning?: string;
        assumptions?: string;
        riskFactors?: string;
    }): Promise<PricingRecommendation> {
        const pricingId = `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const pricing = await db.pricing_recommendations.create({
            data: {
                id: pricingId,
                commercial_package_id: params.commercialPackageId,
                solution_architecture_id: params.solutionArchitectureId,
                solution_version_id: params.solutionVersionId,
                recommended_price: params.recommendedPrice,
                cost_floor: params.costFloor,
                target_price: params.targetPrice,
                currency: params.currency || 'USD',
                reasoning: params.reasoning,
                assumptions: params.assumptions,
                risk_factors: params.riskFactors,
                status: PricingStatus.GENERATED,
                created_by: params.userId,
                pricing_version: 1
            }
        });

        await auditLogger.log({
            action: 'PRICING_RECOMMENDATION_CREATED',
            entityType: 'PricingRecommendation',
            entityId: pricingId,
            details: { commercialPackageId: params.commercialPackageId }
        });

        return this.mapToDomainPricing(pricing);
    }

    /**
     * Creates a commercial offer option.
     */
    async createOfferOption(params: {
        commercialPackageId: string;
        name: string;
        setupFee: number;
        recurringFee: number;
        userId: string;
        billingCycle: BillingCycle;
        currency?: string;
        description?: string;
        includedScope: string[];
        optionalScope: string[];
        outOfScope: string[];
    }): Promise<OfferOption> {
        const offerId = `off_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const offer = await db.offer_options.create({
            data: {
                id: offerId,
                commercial_package_id: params.commercialPackageId,
                name: params.name,
                setup_fee: params.setupFee,
                recurring_fee: params.recurringFee,
                billing_cycle: params.billingCycle,
                currency: params.currency || 'USD',
                description: params.description,
                included_scope: params.includedScope,
                optional_scope: params.optionalScope,
                out_of_scope: params.outOfScope,
                status: OfferStatus.DRAFT,
                created_by: params.userId,
                version: 1,
                valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
            }
        });

        await auditLogger.log({
            action: 'OFFER_OPTION_CREATED',
            entityType: 'OfferOption',
            entityId: offerId,
            details: { commercialPackageId: params.commercialPackageId }
        });

        return this.mapToDomainOffer(offer);
    }

    async getCommercialPackage(id: string): Promise<CommercialPackage> {
        const pkg = await db.commercial_packages.findUnique({ where: { id } });
        if (!pkg) throw new Error('COMMERCIAL_PACKAGE_NOT_FOUND');
        return this.mapToDomain(pkg);
    }

    private mapToDomain(pkg: any): CommercialPackage {
        return {
            commercialPackageId: pkg.id,
            leadId: pkg.lead_id,
            companyId: pkg.company_id,
            contactId: pkg.contact_id,
            solutionArchitectureId: pkg.solution_architecture_id,
            solutionVersionId: pkg.solution_version_id,
            requirementsVersionId: pkg.requirements_version_id,
            painAnalysisVersionId: pkg.pain_analysis_version_id,
            qualificationVersionId: pkg.qualification_version_id,
            intentVersionId: pkg.intent_version_id,
            demoId: pkg.demo_id,
            status: pkg.status as CommercialPackageStatus,
            currency: pkg.currency,
            validUntil: pkg.valid_until,
            version: pkg.version,
            createdAt: pkg.created_at,
            updatedAt: pkg.updated_at,
            createdBy: pkg.created_by,
            updatedBy: pkg.updated_by
        };
    }

    private mapToDomainPricing(pr: any): PricingRecommendation {
        return {
            pricingId: pr.id,
            commercialPackageId: pr.commercial_package_id,
            solutionArchitectureId: pr.solution_architecture_id,
            solutionVersionId: pr.solution_version_id,
            pricingVersion: pr.pricing_version,
            currency: pr.currency,
            marketRangeMin: pr.market_range_min,
            marketRangeMax: pr.market_range_max,
            costFloor: pr.cost_floor,
            targetPrice: pr.target_price,
            recommendedPrice: pr.recommended_price,
            pricingConfidence: pr.pricing_confidence,
            marketDataConfidence: pr.market_data_confidence,
            reasoning: pr.reasoning,
            assumptions: pr.assumptions,
            riskFactors: pr.risk_factors,
            pricingEvidenceReference: pr.pricing_evidence_reference,
            status: pr.status as PricingStatus,
            createdAt: pr.created_at,
            createdBy: pr.created_by
        };
    }

    private mapToDomainOffer(off: any): OfferOption {
        return {
            offerId: off.id,
            commercialPackageId: off.commercial_package_id,
            name: off.name,
            description: off.description,
            includedScope: off.included_scope,
            optionalScope: off.optional_scope,
            outOfScope: off.out_of_scope,
            setupFee: off.setup_fee,
            recurringFee: off.recurring_fee,
            currency: off.currency,
            billingCycle: off.billing_cycle as BillingCycle,
            minimumCommitmentMonths: off.minimum_commitment_months,
            paymentTerms: off.payment_terms,
            setupPaymentPercentage: off.setup_payment_percentage,
            setupBalanceTerms: off.setup_balance_terms,
            implementationStartCondition: off.implementation_start_condition,
            cancellationTerms: off.cancellation_terms,
            scopeChangeTerms: off.scope_change_terms,
            supportTerms: off.support_terms,
            validUntil: off.valid_until,
            status: off.status as OfferStatus,
            version: off.version,
            createdAt: off.created_at,
            createdBy: off.created_by
        };
    }
}

export const commercialFoundationService = new CommercialFoundationService();

