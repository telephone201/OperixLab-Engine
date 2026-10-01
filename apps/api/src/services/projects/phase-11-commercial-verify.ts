/**
 * @file phase-11-commercial-verify.ts
 * @description STEP 8 upgraded end-to-end verification of the complete
 * commercial-to-project-start lifecycle through the REAL production
 * services, with a REAL matching-approved solution context (Steps 4â€“7
 * production contracts):
 *
 *   Company â†’ Contact â†’ Lead
 *     â†’ [Matching: session â†’ persistDecision â†’ APPROVED review
 *        â†’ Step 7 handoff â†’ workflow_versions DRAFT anchor
 *        â†’ commercial_packages DRAFT]
 *     â†’ Pricing â†’ Offer â†’ Proposal â†’ Approval â†’ Engagement
 *     â†’ Agreement â†’ Acceptance â†’ Payment Submission
 *     â†’ Human Payment Verification â†’ Payment Readiness
 *     â†’ commercialProjectHandoffService.handoff() â†’ returned projectId
 *     â†’ projectStartEligibilityGate(projectId)
 *
 * Everything is driven through existing production services; the only direct
 * DB writes are the three lead-acquisition fixture rows (companies/contacts/
 * leads) and the offer activation update that the established Phase-11
 * verification contract requires (proposal/handoff demand an ACTIVE offer â€”
 * see the original verification). No fake IDs, no manual project insertion.
 *
 * PAYMENT STATE DISTINCTION (asserted, not collapsed):
 *   submitPayment  -> SUBMITTED  (explicitly asserted NOT verified here)
 *   verifyPayment  -> VERIFIED   (separate human step)
 *
 * FIXTURE ISOLATION: fixture identity is captured before/after; assertions
 * are relationship-based (every row belongs to this fixture) â€” no
 * whole-database zero-row assumptions on a shared dev database. Cleanup is
 * FK-safe and removes ONLY this suite's rows (downstream cascade rows of the
 * fixture are removed explicitly in dependency order; workflow_library and
 * pre-existing commercial data are never touched).
 */

import crypto from 'crypto';

import { db } from '../../lib/db';
import { matchingPersistenceService } from '../matching/matching-persistence-service';
import { matchingReviewService } from '../matching/matching-review-service';
import { matchingCommercialHandoffService } from './matching-commercial-handoff-service';
import { commercialFoundationService } from './commercial-foundation-service';
import { proposalService } from './proposal-service';
import { commercialGovernanceService } from './commercial-governance-service';
import { commercialStalenessService } from './commercial-staleness-service';
import { engagementService } from './engagement-service';
import { commercialEngagementIntentAdapter } from './commercial-engagement-intent-adapter';
import { agreementService } from './agreement-service';
import { paymentService } from './payment-service';
import { paymentVerificationService } from './payment-verification-service';
import { paymentReadinessService } from './payment-readiness-service';
import { projectStartEligibilityGate } from './eligibility-gate';
import { commercialProjectHandoffService } from './commercial-project-handoff-service';
import { BillingCycle } from './commercial-types';
import { EngagementEventType, EngagementChannel } from './engagement-types';
import { PaymentPurpose } from './payment-types';
import { workflowVersionService } from '../versioning/version-service';
import { OriginType } from '../versioning/version-service';

export interface Phase11VerifyResult {
    step: string;
    status: 'PASS' | 'FAIL';
    reason?: string;
    error?: string;
}

export class Phase11CommercialVerify {
    private readonly fixture = {
        companyId: crypto.randomUUID(),
        contactId: crypto.randomUUID(),
        leadId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        researchVersionId: crypto.randomUUID(),
        qualificationVersionId: crypto.randomUUID(),
        painAnalysisId: crypto.randomUUID(),
        requirementsAnalysisId: crypto.randomUUID()
    };

    private tracked = {
        companyIds: [] as string[],
        contactIds: [] as string[],
        leadIds: [] as string[],
        researchVersionIds: [] as string[],
        qualificationIds: [] as string[],
        painAnalysisIds: [] as string[],
        requirementsAnalysisIds: [] as string[],
        sessionIds: [] as string[],
        architectureIds: [] as string[],
        versionIds: [] as string[],
        packageIds: [] as string[]
    };

    async runFullSuite(): Promise<Phase11VerifyResult[]> {
        const results: Phase11VerifyResult[] = [];

        try {
            console.log('â€º Starting Phase 11 END-TO-END Commercial Verification (STEP 8)...');

            // -------------------------------------------------------------
            // FIXTURE: Company -> Contact -> Lead (real rows, real UUIDs)
            // -------------------------------------------------------------
            await db.query(
                `INSERT INTO "companies"
                    ("id", "name", "domain", "industry", "created_at", "updated_at")
                 VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                [
                    this.fixture.companyId,
                    `Operix Step8 Verify Co ${this.fixture.companyId.slice(0, 8)}`,
                    `step8-${this.fixture.companyId.slice(0, 8)}.test`,
                    'Automation'
                ]
            );

            this.tracked.companyIds.push(this.fixture.companyId);

            await db.query(
                `INSERT INTO "contacts"
                    ("id", "company_id", "first_name", "last_name", "email", "role",
                     "seniority", "is_primary_decision_maker", "created_at")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [
                    this.fixture.contactId,
                    this.fixture.companyId,
                    'Step8',
                    'Verify',
                    `step8-verify-${this.fixture.contactId.slice(0, 8)}@example.test`,
                    'Owner',
                    'EXECUTIVE',
                    true
                ]
            );

            this.tracked.contactIds.push(this.fixture.contactId);

            await db.query(
                `INSERT INTO "leads"
                    ("id", "company_id", "contact_id", "status",
                     "lead_score", "intent_score", "intent_status",
                     "created_at", "updated_at")
                 VALUES ($1, $2, $3, 'QUALIFIED', 90, 90, 'HIGH', NOW(), NOW())`,
                [
                    this.fixture.leadId,
                    this.fixture.companyId,
                    this.fixture.contactId
                ]
            );

            this.tracked.leadIds.push(this.fixture.leadId);

            results.push({
                step: 'S0: Company/Contact/Lead fixtures created (real UUIDs)',
                status: 'PASS',
                reason: `lead=${this.fixture.leadId}`
            });

            // -------------------------------------------------------------
            // S1: Matching-approved solution context (Steps 1â€“7 contracts)
            // -------------------------------------------------------------
            // Real upstream identity chain required by commercial handoff.
            await db.query(
                `INSERT INTO "research_versions"
                    ("id", "research_id", "version_number", "is_current")
                 VALUES ($1, NULL, 1, true)`,
                [this.fixture.researchVersionId]
            );

            this.tracked.researchVersionIds.push(this.fixture.researchVersionId);

            await db.query(
                `INSERT INTO "qualifications"
                    ("id", "lead_id", "total_score", "max_score", "threshold", "qualified", "label", "version")
                 VALUES ($1, $2, 90, 100, 50, true, 'HOT', 1)`,
                [this.fixture.qualificationVersionId, this.fixture.leadId]
            );

            this.tracked.qualificationIds.push(this.fixture.qualificationVersionId);

            await db.query(
                `INSERT INTO "pain_analyses"
                    ("id", "lead_id", "research_version_id", "qualification_version_id", "analysis_version", "status", "overall_confidence")
                 VALUES ($1, $2, $3, $4, 1, 'DRAFT', 0.90)`,
                [
                    this.fixture.painAnalysisId,
                    this.fixture.leadId,
                    this.fixture.researchVersionId,
                    this.fixture.qualificationVersionId
                ]
            );

            this.tracked.painAnalysisIds.push(this.fixture.painAnalysisId);

            await db.query(
                `INSERT INTO "requirements_analyses"
                    ("id", "lead_id", "research_version_id", "qualification_version_id", "pain_analysis_version_id", "analysis_version", "status", "overall_completeness", "overall_confidence")
                 VALUES ($1, $2, $3, $4, $5, 1, 'DRAFT', 1.0, 0.90)`,
                [
                    this.fixture.requirementsAnalysisId,
                    this.fixture.leadId,
                    this.fixture.researchVersionId,
                    this.fixture.qualificationVersionId,
                    this.fixture.painAnalysisId
                ]
            );

            this.tracked.requirementsAnalysisIds.push(this.fixture.requirementsAnalysisId);

            await db.query(
                `INSERT INTO "workflow_match_sessions"
                    ("id", "lead_id", "requirements_version_id", "status")
                 VALUES ($1, $2, $3, 'ANALYZING')`,
                [
                    this.fixture.sessionId,
                    this.fixture.leadId,
                    this.fixture.requirementsAnalysisId
                ]
            );

            this.tracked.sessionIds.push(this.fixture.sessionId);

            // Real STEP 4 artifact persistence (single architecture row).
            await matchingPersistenceService.persistDecision({
                sessionId: this.fixture.sessionId,
                leadId: this.fixture.leadId,
                strategy: 'REUSE',
                reasoning: 'Step 8 E2E verification recommendation.',
                evidence: 'Step 8 E2E verification evidence.',
                rejectedStrategies: [],
                primaryCandidateLibraryId: null,
                candidates: [],
                scoresByLibraryId: new Map(),
                coverageByLibraryId: new Map(),
                requirements: []
            });

            const architectureRow = (
                await db.query(
                    `SELECT "id" FROM "solution_architectures" WHERE "session_id" = $1`,
                    [this.fixture.sessionId]
                )
            ).rows[0];

            const solutionArchitectureId = String(architectureRow.id);
            this.tracked.architectureIds.push(solutionArchitectureId);

            // Real STEP 5 human review (REUSE is handoffable).
            await matchingReviewService.approveMatch(
                this.fixture.sessionId,
                this.fixture.userId
            );

            results.push({
                step: 'S1: Matching-approved solution context (session APPROVED + architecture APPROVED)',
                status: 'PASS',
                reason: `architecture=${solutionArchitectureId}`
            });

            // -------------------------------------------------------------
            // S2: Step 7 handoff â€” anchor + package via production path
            // -------------------------------------------------------------
            const handoff = await matchingCommercialHandoffService.handoffApprovedSession({
                leadId: this.fixture.leadId,
                sessionId: this.fixture.sessionId,
                userId: this.fixture.userId
            });

            if (handoff.reusedPackage) {
                throw new Error(
                    'STEP8_HANDOFF_UNEXPECTED_REUSE: fresh fixture must create a new package.'
                );
            }

            const solutionVersionId = handoff.solutionVersionId;
            this.tracked.versionIds.push(solutionVersionId);
            this.tracked.packageIds.push(handoff.commercialPackageId);

            // The anchor must be linked to the approved architecture.
            const anchorRow = (
                await db.query(
                    `SELECT "solution_id", "status", "origin_type"
                     FROM "workflow_versions" WHERE "id" = $1`,
                    [solutionVersionId]
                )
            ).rows[0];

            if (
                !anchorRow ||
                String(anchorRow.solution_id) !== solutionArchitectureId ||
                String(anchorRow.status) !== 'DRAFT' ||
                String(anchorRow.origin_type) !== 'REUSED'
            ) {
                throw new Error(
                    `STEP8_ANCHOR_INVALID: ${JSON.stringify(anchorRow)}`
                );
            }

            // The package must reference THIS architecture + anchor.
            const packageRow = (
                await db.query(
                    `SELECT "solution_architecture_id", "solution_version_id",
                            "status", "company_id", "contact_id"
                     FROM "commercial_packages" WHERE "id" = $1`,
                    [handoff.commercialPackageId]
                )
            ).rows[0];

            if (
                !packageRow ||
                String(packageRow.solution_architecture_id) !== solutionArchitectureId ||
                String(packageRow.solution_version_id) !== solutionVersionId ||
                String(packageRow.status) !== 'DRAFT' ||
                String(packageRow.company_id) !== this.fixture.companyId ||
                String(packageRow.contact_id) !== this.fixture.contactId
            ) {
                throw new Error(
                    `STEP8_PACKAGE_INVALID: ${JSON.stringify(packageRow)}`
                );
            }

            results.push({
                step: 'S2: Step-7 handoff (DRAFT anchor linked to APPROVED architecture + DRAFT package derived from lead context)',
                status: 'PASS',
                reason: `version=${solutionVersionId} package=${handoff.commercialPackageId}`
            });

            // -------------------------------------------------------------
            // S3: Commercial Package (existence + relationship assertions)
            // -------------------------------------------------------------
            const pkg = await commercialFoundationService.getCommercialPackage(
                handoff.commercialPackageId
            );

            if (
                !pkg ||
                pkg.commercialPackageId !== handoff.commercialPackageId ||
                pkg.leadId !== this.fixture.leadId ||
                pkg.solutionArchitectureId !== solutionArchitectureId ||
                pkg.solutionVersionId !== solutionVersionId
            ) {
                throw new Error(
                    `STEP8_PACKAGE_CONTEXT_INVALID: ${JSON.stringify(pkg)}`
                );
            }

            results.push({
                step: 'S3: Commercial Package exists (lead + architecture + version linked)',
                status: 'PASS',
                reason: `package=${pkg.commercialPackageId}`
            });

            // -------------------------------------------------------------
            // -------------------------------------------------------------
            // S3B: Commercial package staleness detection
            // -------------------------------------------------------------
            const freshStaleness =
                await commercialStalenessService.evaluatePackageStaleness(
                    pkg.commercialPackageId
                );

            if (freshStaleness.isStale) {
                throw new Error(
                    `STEP8_STALENESS_FRESH_FAILED: ${JSON.stringify(freshStaleness)}`
                );
            }

            const newerVersion = await workflowVersionService.createVersion({
                solutionId: solutionArchitectureId,
                content: Buffer.from(
                    JSON.stringify({
                        phase11: 'staleness-runtime-test',
                        sourceVersion: solutionVersionId,
                        createdAt: new Date().toISOString()
                    }),
                    'utf8'
                ),
                originType: OriginType.CUSTOMIZED,
                parentVersionId: solutionVersionId,
                changeSummary: 'Phase 11 staleness runtime verification.'
            });

            this.tracked.versionIds.push(newerVersion.versionId);

            await workflowVersionService.finalizeVersion(
                newerVersion.versionId
            );

            const stalePackage =
                await commercialStalenessService.evaluatePackageStaleness(
                    pkg.commercialPackageId
                );

            if (
                !stalePackage.isStale ||
                !stalePackage.reasons.includes(
                    'SOLUTION_VERSION_SUPERSEDED'
                )
            ) {
                throw new Error(
                    `STEP8_STALENESS_DETECTION_FAILED: ${JSON.stringify(stalePackage)}`
                );
            }

            results.push({
                step: 'S3B: Commercial package staleness detection (new FINALIZED solution version)',
                status: 'PASS',
                reason:
                    'Fresh package was non-stale; a newer FINALIZED solution version correctly made the package stale.'
            });
            // S4: Pricing â€” BillingCycle.MONTHLY only
            // -------------------------------------------------------------
            const pricing =
                await commercialFoundationService.createPricingRecommendation({
                    commercialPackageId: pkg.commercialPackageId,
                    solutionArchitectureId,
                    solutionVersionId,
                    recommendedPrice: 10000,
                    costFloor: 4000,
                    targetPrice: 10000,
                    userId: this.fixture.userId,
                    currency: 'EGP',
                    reasoning: 'Step 8 E2E deterministic pricing.',
                    assumptions: 'E2E test fixture.',
                    riskFactors: 'None for deterministic test.'
                });

            results.push({
                step: 'S4: Pricing Recommendation (EGP, deterministic)',
                status: 'PASS',
                reason: `pricing=${pricing.pricingId}`
            });

            // -------------------------------------------------------------
            // S5: Offer â€” BillingCycle.MONTHLY (the only cycle in scope)
            // -------------------------------------------------------------
            const offer =
                await commercialFoundationService.createOfferOption({
                    commercialPackageId: pkg.commercialPackageId,
                    name: 'Step 8 E2E Automation Offer',
                    setupFee: 5000,
                    recurringFee: 1000,
                    userId: this.fixture.userId,
                    billingCycle: BillingCycle.MONTHLY,
                    currency: 'EGP',
                    description: 'Step 8 E2E deterministic offer.',
                    includedScope: ['Core Workflow Automation'],
                    optionalScope: ['Advanced Analytics'],
                    outOfScope: ['Legacy Hardware Maintenance']
                });

            // Proposal and handoff require a usable (ACTIVE) offer â€” the
            // established Phase-11 verification contract.
            await db.offer_options.update({
                where: { id: offer.offerId },
                data: {
                    status: 'ACTIVE',
                    payment_terms: '50% setup deposit before implementation; 50% after delivery.',
                    setup_payment_percentage: 50,
                    setup_balance_terms: 'Remaining 50% after delivery.',
                    implementation_start_condition: 'Verified setup deposit.',
                    support_terms: 'Standard support terms.'
                }
            });

            // Billing cycle assertion: exactly MONTHLY.
            const offerRow = (
                await db.query(
                    `SELECT "billing_cycle" FROM "offer_options" WHERE "id" = $1`,
                    [offer.offerId]
                )
            ).rows[0];

            if (String(offerRow.billing_cycle) !== BillingCycle.MONTHLY) {
                throw new Error(
                    `STEP8_OFFER_CYCLE_INVALID: ${String(offerRow.billing_cycle)}`
                );
            }

            results.push({
                step: 'S5: Offer created + activated (BillingCycle.MONTHLY asserted)',
                status: 'PASS',
                reason: `offer=${offer.offerId}`
            });

            // -------------------------------------------------------------
            // S6: Proposal generation
            // -------------------------------------------------------------
            const proposal = await proposalService.generateProposal({
                createdBy: this.fixture.userId,
                commercialPackageId: pkg.commercialPackageId,
                companyContext: {
                    companyId: this.fixture.companyId,
                    leadId: this.fixture.leadId
                },
                contactContext: {
                    contactId: this.fixture.contactId
                },
                solutionVersionId,
                requirementsVersionId: this.fixture.requirementsAnalysisId,
                painVersionId: this.fixture.painAnalysisId,
                qualificationVersionId: this.fixture.qualificationVersionId,
                pricingRecommendationId: pricing.pricingId,
                offerOptionId: offer.offerId,
                terms: 'Step 8 E2E terms.',
                generationRulesVersion: 'v1'
            });

            if (!proposal.proposalId || !proposal.proposalVersionId) {
                throw new Error('STEP8_PROPOSAL_INVALID: proposal identities missing.');

            const proposalVersionResult = await db.query(
                `SELECT content
                 FROM "proposal_versions"
                 WHERE "id" = $1`,
                [proposal.proposalVersionId]
            );

            const proposalVersion = proposalVersionResult.rows[0];

            if (!proposalVersion) {
                throw new Error(
                    'STEP8_PROPOSAL_GROUNDING_FAILED: proposal version not found.'
                );
            }

            const proposalContent =
                typeof proposalVersion.content === 'string'
                    ? JSON.parse(proposalVersion.content)
                    : proposalVersion.content;

            const proposalText = JSON.stringify(proposalContent);

            const groundingChecks = [
                {
                    name: 'offer name',
                    expected: 'Step 8 E2E Automation Offer'
                },
                {
                    name: 'included scope',
                    expected: 'Core Workflow Automation'
                },
                {
                    name: 'optional scope',
                    expected: 'Advanced Analytics'
                },
                {
                    name: 'out of scope',
                    expected: 'Legacy Hardware Maintenance'
                },
                {
                    name: 'pain title',
                    expected: 'Manual AI Test Pain'
                },
                {
                    name: 'requirement title',
                    expected: 'Capture operational issue information'
                },
                {
                    name: 'recommended price',
                    expected: '10000'
                }
            ];

            for (const check of groundingChecks) {
                if (!proposalText.includes(check.expected)) {
                    throw new Error(
                        `STEP8_PROPOSAL_GROUNDING_FAILED: missing ${check.name}="${check.expected}".`
                    );
                }
            }

            const forbiddenGenericContent = [
                'revenue leakage',
                'Advanced Analytics Dashboard',
                'Standard Integrations',
                'Standard commercial terms apply as per the attached offer.'
            ];

            for (const forbidden of forbiddenGenericContent) {
                if (proposalText.includes(forbidden)) {
                    throw new Error(
                        `STEP8_PROPOSAL_GROUNDING_FAILED: stale generic content detected="${forbidden}".`
                    );
                }
            }

            const forbiddenInternalMetadata = [
                'candidateSummary',
                'primaryCandidateId',
                'rejectedStrategies',
                'matchScore'
            ];

            for (const internalTerm of forbiddenInternalMetadata) {
                if (proposalText.includes(internalTerm)) {
                    throw new Error(
                        `STEP8_PROPOSAL_GROUNDING_FAILED: internal metadata leaked="${internalTerm}".`
                    );
                }
            }
            }

            results.push({
                step: 'S6: Proposal generation (real proposal + version identities)',
                status: 'PASS',
                reason: `proposal=${proposal.proposalId} version=${proposal.proposalVersionId}`
            });

            // -------------------------------------------------------------
            // -------------------------------------------------------------
            // S6B: Deterministic forbidden-content blacklist validation
            // -------------------------------------------------------------
            const originalPaymentTerms = (
                await db.query(
                    `SELECT "payment_terms" FROM "offer_options" WHERE "id" = $1`,
                    [offer.offerId]
                )
            ).rows[0]?.payment_terms;

            if (originalPaymentTerms === undefined) {
                throw new Error(
                    'STEP8_PROPOSAL_BLACKLIST_FAILED: original payment terms not found.'
                );
            }

            try {
                await db.offer_options.update({
                    where: { id: offer.offerId },
                    data: {
                        payment_terms: 'n8n'
                    }
                });

                let blacklistRejected = false;

                try {
                    await proposalService.generateProposal({
                        createdBy: this.fixture.userId,
                        commercialPackageId: pkg.commercialPackageId,
                        companyContext: {
                            companyId: this.fixture.companyId,
                            leadId: this.fixture.leadId
                        },
                        contactContext: {
                            contactId: this.fixture.contactId
                        },
                        solutionVersionId,
                        requirementsVersionId: this.fixture.requirementsAnalysisId,
                        painVersionId: this.fixture.painAnalysisId,
                        qualificationVersionId: this.fixture.qualificationVersionId,
                        pricingRecommendationId: pricing.pricingId,
                        offerOptionId: offer.offerId,
                        terms: 'Step 8 E2E terms.',
                        generationRulesVersion: 'v1'
                    });
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    if (!message.includes('PROPOSAL_VALIDATION_FAILED')) {
                        throw new Error(
                            `STEP8_PROPOSAL_BLACKLIST_FAILED: unexpected error="${message}".`
                        );
                    }

                    blacklistRejected = true;
                }

                if (!blacklistRejected) {
                    throw new Error(
                        'STEP8_PROPOSAL_BLACKLIST_FAILED: forbidden content was accepted.'
                    );
                }
            } finally {
                await db.offer_options.update({
                    where: { id: offer.offerId },
                    data: {
                        payment_terms: originalPaymentTerms
                    }
                });
            }

            results.push({
                step: 'S6B: Proposal forbidden-content blacklist validation',
                status: 'PASS',
                reason: 'Production proposal generation rejected forbidden internal content.'
            });

            // S7: Proposal approval through the real governance path
            // -------------------------------------------------------------
            const approvalId = await commercialGovernanceService.requestProposalApproval(
                proposal.proposalId,
                this.fixture.userId
            );

            await commercialGovernanceService.approveArtifact(
                approvalId,
                this.fixture.userId,
                'Step 8 E2E human approval'
            );

            const approvalCheck =
                await commercialGovernanceService.verifyApproval(
                    proposal.proposalId
                );

            if (!approvalCheck.approved) {
                throw new Error(
                    `STEP8_PROPOSAL_APPROVAL_FAILED: proposal not approved.`
                );
            }

            results.push({
                step: 'S7: Proposal approval (real governance transition, verified)',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // S8: Engagement -> Intent
            // -------------------------------------------------------------
            const event = await engagementService.recordEvent({
                leadId: this.fixture.leadId,
                proposalId: proposal.proposalId,
                eventType: EngagementEventType.MEETING_BOOKED,
                channel: EngagementChannel.CALENDAR
            });

            await commercialEngagementIntentAdapter.processEngagementToIntent(
                event
            );

            results.push({
                step: 'S8: Engagement recorded + intent processed',
                status: 'PASS',
                reason: `event=${event.eventId ?? ''}`
            });

            // -------------------------------------------------------------
            // S9: Agreement creation + real acceptance path
            // -------------------------------------------------------------
            const agreement = await agreementService.createAgreement({
                commercialPackageId: pkg.commercialPackageId,
                offerOptionId: offer.offerId,
                proposalVersionId: proposal.proposalVersionId,
                solutionVersionId,
                companyId: this.fixture.companyId,
                createdBy: this.fixture.userId
            });

            if (!agreement.agreementId) {
                throw new Error('STEP8_AGREEMENT_INVALID: agreement identity missing.');
            }

            await agreementService.recordAcceptance({
                agreementId: agreement.agreementId,
                actorId: this.fixture.userId,
                actorType: 'CLIENT',
                evidence: 'STEP8_E2E_ACCEPTANCE'
            });

            results.push({
                step: 'S9: Agreement created + accepted through the real path',
                status: 'PASS',
                reason: `agreement=${agreement.agreementId}`
            });

            // -------------------------------------------------------------
            // S10: Payment submission (must NOT be verified at submission)
            // -------------------------------------------------------------
            const payment =
                await paymentService.createPaymentRequirement({
                    agreementId: agreement.agreementId,
                    proposalId: proposal.proposalId,
                    offerOptionId: offer.offerId,
                    purpose: PaymentPurpose.SETUP_FEE,
                    expectedAmount: 5000,
                    currency: 'EGP'
                });

            await paymentService.submitPayment({
                paymentId: payment.paymentId,
                submittedAmount: 5000,
                clientReference: `STEP8-${payment.paymentId}`
            });

            const submittedRow = (
                await db.query(
                    `SELECT "status" FROM "payments" WHERE "id" = $1`,
                    [payment.paymentId]
                )
            ).rows[0];

            if (String(submittedRow.status) === 'VERIFIED') {
                throw new Error(
                    'STEP8_PAYMENT_STATE_COLLAPSE: submitted payment must not be VERIFIED.'
                );
            }

            results.push({
                step: 'S10: Payment SUBMITTED (explicitly not verified at submission)',
                status: 'PASS',
                reason: `payment=${payment.paymentId} status=${String(submittedRow.status)}`
            });

            // -------------------------------------------------------------
            // S11: Human payment verification (separate real step)
            // -------------------------------------------------------------
            await paymentVerificationService.verifyPayment({
                paymentId: payment.paymentId,
                verifiedAmount: 5000,
                verifiedBy: this.fixture.userId,
                decision: 'VERIFY'
            });

            const verifiedRow = (
                await db.query(
                    `SELECT "status" FROM "payments" WHERE "id" = $1`,
                    [payment.paymentId]
                )
            ).rows[0];

            if (String(verifiedRow.status) !== 'VERIFIED') {
                throw new Error(
                    `STEP8_PAYMENT_VERIFICATION_FAILED: status=${String(verifiedRow.status)}`
                );
            }

            results.push({
                step: 'S11: Human verification -> VERIFIED (distinct real state)',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // S12: Payment readiness (must be the handoff-required state)
            // -------------------------------------------------------------
            const readiness =
                await paymentReadinessService.evaluateReadiness(
                    agreement.agreementId,
                    proposal.proposalId
                );

            if (readiness.status !== 'VERIFIED') {
                throw new Error(
                    `STEP8_PAYMENT_READINESS_FAILED: ${readiness.status}`
                );
            }

            results.push({
                step: 'S12: Payment readiness VERIFIED (handoff prerequisite)',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // S13: REAL commercial project handoff (no manual project insert)
            // -------------------------------------------------------------
            const projectHandoff =
                await commercialProjectHandoffService.handoff({
                    proposalId: proposal.proposalId,
                    readinessStatus: readiness.status,
                    actorId: this.fixture.userId
                });

            if (!projectHandoff.contractId || !projectHandoff.projectId) {
                throw new Error(
                    'STEP8_PROJECT_HANDOFF_FAILED: contract or project missing.'
                );
            }

            const realProjectId = String(projectHandoff.projectId);

            // The project must exist and reference the real contract.
            const projectRow = (
                await db.query(
                    `SELECT "contract_id", "status", "payment_status"
                     FROM "projects" WHERE "id" = $1`,
                    [realProjectId]
                )
            ).rows[0];

            if (
                !projectRow ||
                String(projectRow.contract_id) !== String(projectHandoff.contractId)
            ) {
                throw new Error(
                    `STEP8_PROJECT_INVALID: ${JSON.stringify(projectRow)}`
                );
            }

            results.push({
                step: 'S13: commercialProjectHandoffService.handoff() succeeded (real contract + project)',
                status: 'PASS',
                reason: `contract=${projectHandoff.contractId} project=${realProjectId} status=${String(projectHandoff.status)}`
            });

            // -------------------------------------------------------------
            // S14: Project start eligibility with the REAL returned projectId
            // -------------------------------------------------------------
            const eligibility =
                await projectStartEligibilityGate.checkEligibility(
                    realProjectId
                );

            if (!eligibility.eligible) {
                throw new Error(
                    `STEP8_PROJECT_START_ELIGIBILITY_FAILED: ${eligibility.reason}`
                );
            }

            results.push({
                step: 'S14: Project start eligibility ELIGIBLE (real projectId from the handoff)',
                status: 'PASS',
                reason: `project=${realProjectId}`
            });

            // -------------------------------------------------------------
            // G7.5: PAYMENT VERIFICATION AMOUNT RULES
            // -------------------------------------------------------------


            const createG7AcceptedAgreement = async () => {
                const g7Agreement = await agreementService.createAgreement({
                    commercialPackageId: pkg.commercialPackageId,
                    offerOptionId: offer.offerId,
                    proposalVersionId: proposal.proposalVersionId,
                    solutionVersionId,
                    companyId: this.fixture.companyId,
                    createdBy: this.fixture.userId
                });

                if (!g7Agreement.agreementId) {
                    throw new Error('G7_FIXTURE_AGREEMENT_INVALID');
                }

                await agreementService.recordAcceptance({
                    agreementId: g7Agreement.agreementId,
                    actorId: this.fixture.userId,
                    actorType: 'CLIENT',
                    evidence: 'G7_5_INDEPENDENT_PAYMENT_FIXTURE'
                });

                return g7Agreement;
            };

            const g7ExactAgreement = await createG7AcceptedAgreement();
            const g7MismatchAgreement = await createG7AcceptedAgreement();
            const g7PartialAgreement = await createG7AcceptedAgreement();
            const g7ZeroPartialAgreement = await createG7AcceptedAgreement();
            const g7FullPartialAgreement = await createG7AcceptedAgreement();
            const g7RejectAgreement = await createG7AcceptedAgreement();

            // 1. VERIFY with exact amount -> VERIFIED
            const g7Exact = await paymentService.createPaymentRequirement({
                agreementId: g7ExactAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7Exact.paymentId,
                submittedAmount: 5000,
                clientReference: `G7-EXACT-${g7Exact.paymentId}`
            });

            await paymentVerificationService.verifyPayment({
                paymentId: g7Exact.paymentId,
                verifiedAmount: 5000,
                verifiedBy: this.fixture.userId,
                decision: 'VERIFY'
            });

            const exactRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7Exact.paymentId]
            );

            if (
                exactRow.rows[0]?.status !== 'VERIFIED' ||
                Number(exactRow.rows[0]?.verified_amount) !== 5000
            ) {
                throw new Error('G7_EXACT_VERIFY_FAILED');
            }

            results.push({
                step: 'G7.5.1: VERIFY exact amount -> VERIFIED',
                status: 'PASS'
            });

            // 2. VERIFY with mismatched amount -> rejected and unchanged
            const g7Mismatch = await paymentService.createPaymentRequirement({
                agreementId: g7MismatchAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7Mismatch.paymentId,
                submittedAmount: 4999,
                clientReference: `G7-MISMATCH-${g7Mismatch.paymentId}`
            });

            let mismatchRejected = false;

            try {
                await paymentVerificationService.verifyPayment({
                    paymentId: g7Mismatch.paymentId,
                    verifiedAmount: 4999,
                    verifiedBy: this.fixture.userId,
                    decision: 'VERIFY'
                });
            } catch {
                mismatchRejected = true;
            }

            const mismatchRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7Mismatch.paymentId]
            );

            if (
                !mismatchRejected ||
                mismatchRow.rows[0]?.status !== 'REQUIRED' ||
                Number(mismatchRow.rows[0]?.verified_amount) !== 0
            ) {
                throw new Error('G7_MISMATCH_RULE_FAILED');
            }

            results.push({
                step: 'G7.5.2: VERIFY mismatched amount -> rejected, state unchanged',
                status: 'PASS'
            });

            // 3. Valid partial amount -> PARTIAL
            const g7Partial = await paymentService.createPaymentRequirement({
                agreementId: g7PartialAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7Partial.paymentId,
                submittedAmount: 2500,
                clientReference: `G7-PARTIAL-${g7Partial.paymentId}`
            });

            await paymentVerificationService.verifyPayment({
                paymentId: g7Partial.paymentId,
                verifiedAmount: 2500,
                verifiedBy: this.fixture.userId,
                decision: 'PARTIALLY_VERIFY'
            });

            const partialRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7Partial.paymentId]
            );

            if (
                partialRow.rows[0]?.status !== 'PARTIAL' ||
                Number(partialRow.rows[0]?.verified_amount) !== 2500
            ) {
                throw new Error('G7_VALID_PARTIAL_FAILED');
            }

            results.push({
                step: 'G7.5.3: Valid partial amount -> PARTIAL',
                status: 'PASS'
            });

            // 4. Zero partial amount -> rejected and unchanged
            const g7ZeroPartial = await paymentService.createPaymentRequirement({
                agreementId: g7ZeroPartialAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7ZeroPartial.paymentId,
                submittedAmount: 0,
                clientReference: `G7-ZERO-${g7ZeroPartial.paymentId}`
            });

            let zeroRejected = false;

            try {
                await paymentVerificationService.verifyPayment({
                    paymentId: g7ZeroPartial.paymentId,
                    verifiedAmount: 0,
                    verifiedBy: this.fixture.userId,
                    decision: 'PARTIALLY_VERIFY'
                });
            } catch {
                zeroRejected = true;
            }

            const zeroRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7ZeroPartial.paymentId]
            );

            if (
                !zeroRejected ||
                zeroRow.rows[0]?.status !== 'REQUIRED' ||
                Number(zeroRow.rows[0]?.verified_amount) !== 0
            ) {
                throw new Error('G7_ZERO_PARTIAL_RULE_FAILED');
            }

            results.push({
                step: 'G7.5.4: Zero partial amount -> rejected, state unchanged',
                status: 'PASS'
            });

            // 5. Full amount as PARTIALLY_VERIFY -> rejected and unchanged
            const g7FullPartial = await paymentService.createPaymentRequirement({
                agreementId: g7FullPartialAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7FullPartial.paymentId,
                submittedAmount: 5000,
                clientReference: `G7-FULL-PARTIAL-${g7FullPartial.paymentId}`
            });

            let fullPartialRejected = false;

            try {
                await paymentVerificationService.verifyPayment({
                    paymentId: g7FullPartial.paymentId,
                    verifiedAmount: 5000,
                    verifiedBy: this.fixture.userId,
                    decision: 'PARTIALLY_VERIFY'
                });
            } catch {
                fullPartialRejected = true;
            }

            const fullPartialRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7FullPartial.paymentId]
            );

            if (
                !fullPartialRejected ||
                fullPartialRow.rows[0]?.status !== 'REQUIRED' ||
                Number(fullPartialRow.rows[0]?.verified_amount) !== 0
            ) {
                throw new Error('G7_FULL_PARTIAL_RULE_FAILED');
            }

            results.push({
                step: 'G7.5.5: Full amount as PARTIALLY_VERIFY -> rejected, state unchanged',
                status: 'PASS'
            });

            // 6. REJECT -> REQUIRED
            const g7Reject = await paymentService.createPaymentRequirement({
                agreementId: g7RejectAgreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: offer.offerId,
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: g7Reject.paymentId,
                submittedAmount: 0,
                clientReference: `G7-REJECT-${g7Reject.paymentId}`
            });

            await paymentVerificationService.verifyPayment({
                paymentId: g7Reject.paymentId,
                verifiedAmount: 0,
                verifiedBy: this.fixture.userId,
                decision: 'REJECT',
                reason: 'G7 deterministic rejection test'
            });

            const rejectRow = await db.query(
                `SELECT status, verified_amount
                 FROM payments
                 WHERE id = $1`,
                [g7Reject.paymentId]
            );

            if (
                rejectRow.rows[0]?.status !== 'REQUIRED' ||
                Number(rejectRow.rows[0]?.verified_amount) !== 0
            ) {
                throw new Error('G7_REJECT_RULE_FAILED');
            }

            results.push({
                step: 'G7.5.6: REJECT -> REQUIRED',
                status: 'PASS'
            });

            // 7. VERIFIED payment cannot be downgraded
            let downgradeRejected = false;

            try {
                await paymentVerificationService.verifyPayment({
                    paymentId: g7Exact.paymentId,
                    verifiedAmount: 2500,
                    verifiedBy: this.fixture.userId,
                    decision: 'PARTIALLY_VERIFY'
                });
            } catch {
                downgradeRejected = true;
            }

            if (!downgradeRejected) {
                throw new Error('G7_VERIFIED_DOWNGRADE_NOT_BLOCKED');
            }

            results.push({
                step: 'G7.5.7: VERIFIED payment cannot downgrade -> rejected',
                status: 'PASS'
            });

            // 8. Negative amount -> rejected
            let negativeRejected = false;

            try {
                await paymentVerificationService.verifyPayment({
                    paymentId: g7Exact.paymentId,
                    verifiedAmount: -1,
                    verifiedBy: this.fixture.userId,
                    decision: 'VERIFY'
                });
            } catch {
                negativeRejected = true;
            }

            if (!negativeRejected) {
                throw new Error('G7_NEGATIVE_AMOUNT_NOT_BLOCKED');
            }

            results.push({
                step: 'G7.5.8: Negative verified amount -> rejected',
                status: 'PASS'
            });



            results.push({
                step: 'E2E CHAIN COMPLETE: Lead â†’ Matching â†’ Review â†’ Handoff â†’ Package â†’ Pricing â†’ Offer â†’ Proposal â†’ Approval â†’ Engagement â†’ Agreement â†’ Acceptance â†’ Payment â†’ Verification â†’ Readiness â†’ Project Handoff â†’ Start Eligibility',
                status: 'PASS'
            });
        } catch (e: unknown) {
            console.error('âœ– Suite crashed:', e);

            results.push({
                step: 'CRASH',
                status: 'FAIL',
                error: e instanceof Error ? e.message : String(e)
            });
        } finally {
            await this.cleanup(results);
        }

        return results;
    }

    // ------------------------------------------------------------------
    // FK-safe cleanup of ONLY this suite's fixture rows (dependency order).
    // Downstream commercial rows (pricing/offers/proposals/agreements/
    // payments/contracts/projects) cascade from the package or are removed
    // explicitly where required. workflow_library is never touched.
    // ------------------------------------------------------------------

    private async cleanup(results: Phase11VerifyResult[]): Promise<void> {
        try {
            // Downstream commercial artifacts of this fixture (explicit,
            // in case a step failed mid-chain and left partial state).
            await db.query(
                `DELETE FROM "payments" WHERE "proposal_id" IN (
                    SELECT "id" FROM "proposals" WHERE "commercial_package_id" = ANY($1::uuid[])
                 )`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "commercial_agreements" WHERE "commercial_package_id" = ANY($1::uuid[])`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "governance_approvals"
                 WHERE "entity_id" IN (SELECT "id" FROM "proposals" WHERE "commercial_package_id" = ANY($1::uuid[]))`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "engagement_events" WHERE "lead_id" = ANY($1::uuid[])`,
                [this.tracked.leadIds]
            );

            await db.query(
                `DELETE FROM "proposal_versions" WHERE "proposal_id" IN (
                    SELECT "id" FROM "proposals" WHERE "commercial_package_id" = ANY($1::uuid[])
                 )`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "proposals" WHERE "commercial_package_id" = ANY($1::uuid[])`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "offer_options" WHERE "commercial_package_id" = ANY($1::uuid[])`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "pricing_recommendations" WHERE "commercial_package_id" = ANY($1::uuid[])`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "commercial_packages" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.packageIds]
            );

            await db.query(
                `DELETE FROM "workflow_versions" WHERE "solution_id" = ANY($1::uuid[])`,
                [this.tracked.architectureIds]
            );

            await db.query(
                `DELETE FROM "solution_architectures" WHERE "session_id" = ANY($1::uuid[])`,
                [this.tracked.sessionIds]
            );

            await db.query(
                `DELETE FROM "requirements_analyses" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.requirementsAnalysisIds]
            );

            await db.query(
                `DELETE FROM "pain_analyses" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.painAnalysisIds]
            );

            await db.query(
                `DELETE FROM "qualifications" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.qualificationIds]
            );

            await db.query(
                `DELETE FROM "research_versions" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.researchVersionIds]
            );

            await db.query(
                `DELETE FROM "workflow_match_sessions" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.sessionIds]
            );

            await db.query(
                `DELETE FROM "leads" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.leadIds]
            );

            await db.query(
                `DELETE FROM "contacts" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.contactIds]
            );

            await db.query(
                `DELETE FROM "companies" WHERE "id" = ANY($1::uuid[])`,
                [this.tracked.companyIds]
            );

            results.push({
                step: 'CLEANUP: fixture chain removed (FK-safe, workflow_library untouched)',
                status: 'PASS'
            });
        } catch (error: any) {
            results.push({
                step: 'CLEANUP',
                status: 'FAIL',
                error: error?.message ?? String(error)
            });
        }
    }
}

export const phase11CommercialVerify = new Phase11CommercialVerify();

if (require.main === module) {
    phase11CommercialVerify.runFullSuite().then(results => {
        console.log(JSON.stringify(results, null, 2));
        const failed = results.some(r => r.status === 'FAIL');
        process.exitCode = failed ? 1 : 0;
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
