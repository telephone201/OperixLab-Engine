/**
 * @file proposal-generator.ts
 * @description AI-assisted generator for client-facing proposals.
 */

import {
    ProposalContent,
    ProposalGenerationInput,
    ProposalGenerationResult
} from './proposal-types';
import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';
import crypto from 'crypto';


interface ProposalGroundingContext {
    company: {
        name: string;
        industry: string | null;
        website: string | null;
    } | null;

    contact: {
        firstName: string;
        lastName: string;
        role: string | null;
    } | null;

    qualification: {
        qualified: boolean;
        label: string | null;
        totalScore: number | null;
        threshold: number | null;
    } | null;

    primaryPain: {
        title: string;
        description: string;
        severity: string | null;
        frequency: string | null;
        priority: string | null;
        confidence: number | null;
        impactEvidence: string[];
    } | null;

    requirements: Array<{
        title: string;
        description: string;
        priority: string | null;
        certainty: string | null;
        trigger: string | null;
        humanActionRequired: boolean | null;
        automationBoundary: string | null;
        integrations: unknown;
    }>;

    solutionArchitecture: {
        strategy: string;
        description: string | null;
    } | null;

    pricing: {
        recommendedPrice: number;
        currency: string;
    };

    offer: {
        name: string;
        description: string;
        includedScope: string[];
        optionalScope: string[];
        outOfScope: string[];
        setupFee: number;
        recurringFee: number;
        currency: string;
        billingCycle: string;
        paymentTerms: string;
        setupPaymentPercentage: number;
        setupBalanceTerms: string;
        implementationStartCondition: string;
    };
}

export class ProposalGenerator {
    private readonly RULES_VERSION = 'v1.0';

    /**
     * Generates structured proposal content using the configured provider.
     * Implements Zero-Cost mode via template fallback.
     */
    async generateProposalContent(input: ProposalGenerationInput): Promise<ProposalContent> {
        console.log(`[PROPOSAL_GEN] Generating proposal content for package ${input.commercialPackageId}...`);

        // In a real implementation, this would call an LLMProvider.
        // For now, we implement the deterministic template fallback (Zero-Cost Mode).
        const context = await this.assembleContext(input);
        return this.generateTemplateFallback(input, context);
    }

    /**
     * Deterministic template fallback for ZERO_COST_MODE.
     * Ensures a valid proposal can be created without an external LLM.
     */
    /**
     * Assembles client-safe factual context from approved commercial sources.
     * Internal matching metadata and architecture blueprint details are excluded.
     */
    private async assembleContext(
        input: ProposalGenerationInput
    ): Promise<ProposalGroundingContext> {
        const [companyResult, contactResult, qualificationResult, painAnalysisResult, requirementsResult, pricingResult, offerResult] =
            await Promise.all([
                db.query(
                    `SELECT name, industry, website
                     FROM companies
                     WHERE id = $1`,
                    [input.companyContext.companyId]
                ),
                db.query(
                    `SELECT first_name, last_name, role
                     FROM contacts
                     WHERE id = $1`,
                    [input.contactContext.contactId]
                ),
                db.query(
                    `SELECT qualified, label, total_score, threshold
                     FROM qualifications
                     WHERE id = $1`,
                    [input.qualificationVersionId]
                ),
                db.query(
                    `SELECT primary_pain_id
                     FROM pain_analyses
                     WHERE id = $1`,
                    [input.painVersionId]
                ),
                db.query(
                    `SELECT title, description, priority, certainty,
                            trigger_definition, human_action_required,
                            automation_boundary, integration_requirements
                     FROM requirements
                     WHERE analysis_id = $1
                     ORDER BY priority, title`,
                    [input.requirementsVersionId]
                ),
                db.query(
                    `SELECT recommended_price, currency
                     FROM pricing_recommendations
                     WHERE id = $1`,
                    [input.pricingRecommendationId]
                ),
                db.query(
                    `SELECT name, description,
                            included_scope, optional_scope, out_of_scope,
                            setup_fee, recurring_fee, currency,
                            billing_cycle, payment_terms,
                            setup_payment_percentage, setup_balance_terms,
                            implementation_start_condition
                     FROM offer_options
                     WHERE id = $1`,
                    [input.offerOptionId]
                )
            ]);

        const company = companyResult.rows[0] ?? null;
        const contact = contactResult.rows[0] ?? null;
        const qualification = qualificationResult.rows[0] ?? null;
        const painAnalysis = painAnalysisResult.rows[0] ?? null;
        const pricing = pricingResult.rows[0];
        const offer = offerResult.rows[0];

        if (!pricing) {
            throw new Error(
                'PROPOSAL_CONTEXT_ASSEMBLY_FAILED: PRICING_NOT_FOUND'
            );
        }

        if (!offer) {
            throw new Error(
                'PROPOSAL_CONTEXT_ASSEMBLY_FAILED: OFFER_NOT_FOUND'
            );
        }

        let primaryPain: ProposalGroundingContext['primaryPain'] = null;

        if (painAnalysis?.primary_pain_id) {
            const painResult = await db.query(
                `SELECT title, description, severity, frequency,
                        priority, confidence
                 FROM pains
                 WHERE id = $1
                   AND analysis_id = $2`,
                [painAnalysis.primary_pain_id, input.painVersionId]
            );

            const pain = painResult.rows[0];

            if (pain) {
                const impactResult = await db.query(
                    `SELECT evidence
                     FROM pain_impacts
                     WHERE pain_id = $1
                       AND evidence IS NOT NULL
                       AND evidence <> ''
                     ORDER BY created_at`,
                    [painAnalysis.primary_pain_id]
                );

                primaryPain = {
                    title: pain.title,
                    description: pain.description,
                    severity: pain.severity,
                    frequency: pain.frequency,
                    priority: pain.priority,
                    confidence: pain.confidence,
                    impactEvidence: impactResult.rows
                        .map((row: { evidence: string }) => row.evidence)
                        .filter(Boolean)
                };
            }
        }

        const architectureResult = await db.query(
            `SELECT strategy
             FROM solution_architectures
             WHERE id = (
                 SELECT solution_id
                 FROM workflow_versions
                 WHERE id = $1
             )`,
            [input.solutionVersionId]
        );

        const architecture = architectureResult.rows[0] ?? null;

        return {
            company: company
                ? {
                    name: company.name,
                    industry: company.industry,
                    website: company.website
                }
                : null,

            contact: contact
                ? {
                    firstName: contact.first_name,
                    lastName: contact.last_name,
                    role: contact.role
                }
                : null,

            qualification: qualification
                ? {
                    qualified: qualification.qualified,
                    label: qualification.label,
                    totalScore: qualification.total_score,
                    threshold: qualification.threshold
                }
                : null,

            primaryPain,

            requirements: requirementsResult.rows.map((row: any) => ({
                title: row.title,
                description: row.description,
                priority: row.priority,
                certainty: row.certainty,
                trigger: row.trigger_definition,
                humanActionRequired: row.human_action_required,
                automationBoundary: row.automation_boundary,
                integrations: row.integration_requirements
            })),

            solutionArchitecture: architecture
                ? {
                    strategy: architecture.strategy,
                    description: null
                }
                : null,

            pricing: {
                recommendedPrice: Number(pricing.recommended_price),
                currency: pricing.currency
            },

            offer: {
                name: offer.name,
                description: offer.description,
                includedScope: offer.included_scope ?? [],
                optionalScope: offer.optional_scope ?? [],
                outOfScope: offer.out_of_scope ?? [],
                setupFee: Number(offer.setup_fee),
                recurringFee: Number(offer.recurring_fee),
                currency: offer.currency,
                billingCycle: offer.billing_cycle,
                paymentTerms: offer.payment_terms,
                setupPaymentPercentage: Number(offer.setup_payment_percentage),
                setupBalanceTerms: offer.setup_balance_terms,
                implementationStartCondition: offer.implementation_start_condition
            }
        };
    }
    private generateTemplateFallback(
        input: ProposalGenerationInput,
        context: ProposalGroundingContext
    ): ProposalContent {
        const companyName =
            context.company?.name?.trim() || 'your organization';

        const industryText =
            context.company?.industry?.trim();

        const companyUnderstanding = industryText
            ? `${companyName} operates in the ${industryText} sector.`
            : `${companyName} is the organization for which this proposal has been prepared.`;

        const painSummary = context.primaryPain
            ? `${context.primaryPain.title}: ${context.primaryPain.description}`
            : 'The proposal is based on the approved business analysis and requirements available for this engagement.';

        const requirementsSummary =
            context.requirements.length > 0
                ? context.requirements
                    .slice(0, 5)
                    .map(
                        (requirement) =>
                            `${requirement.title}: ${requirement.description}`
                    )
                    .join(' ')
                : 'The proposed scope is based on the approved requirements for this engagement.';

        const recommendedSolution = context.offer.description?.trim()
            ? context.offer.description.trim()
            : `A tailored solution represented by the ${context.offer.name}.`;

        const solutionExplanation =
            context.solutionArchitecture?.description?.trim()
                ? context.solutionArchitecture.description.trim()
                : `The proposed solution is structured around the approved requirements and the scope defined in the ${context.offer.name}.`;

        const expectedImpact =
            context.primaryPain?.impactEvidence?.length
                ? `The approved analysis identifies the following impact evidence: ${context.primaryPain.impactEvidence.join(' ')}`
                : 'Expected business impact will be validated against the agreed requirements during implementation.';

        const demo = input.demoId
            ? 'An approved demonstration is available as part of this engagement.'
            : 'A demonstration can be discussed as part of the proposal review.';

        const commercialOptions = [
            {
                name: context.offer.name,
                setupFee: context.offer.setupFee,
                recurringFee: context.offer.recurringFee,
                recommendedPrice: context.pricing.recommendedPrice,
                currency: context.offer.currency || context.pricing.currency,
                billingCycle: context.offer.billingCycle
            }
        ];

        const terms = context.offer.paymentTerms?.trim()
            ? context.offer.paymentTerms.trim()
            : input.terms;

        const assumptions = [
            context.offer.implementationStartCondition,
            ...context.requirements
                .map((requirement) => requirement.automationBoundary)
                .filter(
                    (boundary): boundary is string =>
                        Boolean(boundary && boundary.trim())
                )
        ]
            .filter(Boolean)
            .join(' ');

        const faq =
            'The proposal scope, commercial terms, implementation conditions, and agreed requirements should be reviewed and confirmed before work begins.';

        const nextSteps = context.offer.implementationStartCondition?.trim()
            ? `Next step: ${context.offer.implementationStartCondition.trim()}`
            : 'Next step: review and confirm the proposal scope and commercial terms.';

        const contact = context.contact
            ? `For proposal questions, please contact ${context.contact.firstName} ${context.contact.lastName}${context.contact.role ? ` (${context.contact.role})` : ''}.`
            : 'For proposal questions, please use the agreed business contact channel.';

        return {
            introduction: `Thank you for the opportunity to prepare a proposal for ${companyName}.`,

            companyUnderstanding,

            painSummary,

            requirementsSummary,

            recommendedSolution,

            solutionExplanation,

            expectedImpact,

            demo,

            scope: {
                included: context.offer.includedScope,
                optional: context.offer.optionalScope,
                outOfScope: context.offer.outOfScope
            },

            commercialOptions,

            terms,

            assumptions: assumptions || 'The proposal is based on the approved requirements and commercial offer.',

            faq,

            nextSteps,

            contact
        };
    }

    public getRulesVersion(): string {
        return this.RULES_VERSION;
    }
}

export const proposalGenerator = new ProposalGenerator();

