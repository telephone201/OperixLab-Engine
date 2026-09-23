/**
 * @file phase-11-commercial-verify.ts
 * @description End-to-End Commercial Verification for Phase 11.
 *
 * Verifies the real commercial lifecycle:
 * Company -> Contact -> Lead -> Solution -> Workflow Version
 * -> Commercial Package -> Pricing -> Offer -> Proposal -> Approval
 * -> Engagement -> Agreement -> Acceptance -> Payment Submission
 * -> Human Verification -> Payment Readiness
 * -> Commercial Project Handoff -> Project Start Eligibility.
 */

import crypto from 'crypto';

import { commercialFoundationService } from './commercial-foundation-service';
import { proposalService } from './proposal-service';
import { commercialGovernanceService } from './commercial-governance-service';
import { engagementService } from './engagement-service';
import { commercialEngagementIntentAdapter } from './commercial-engagement-intent-adapter';
import { agreementService } from './agreement-service';
import { paymentService } from './payment-service';
import { paymentVerificationService } from './payment-verification-service';
import { paymentReadinessService } from './payment-readiness-service';
import { projectStartEligibilityGate } from './eligibility-gate';
import { commercialProjectHandoffService } from './commercial-project-handoff-service';
import { db } from '../../lib/db';

import { PaymentPurpose } from './payment-types';
import { PaymentStatus } from './types';
import { BillingCycle } from './commercial-types';
import { EngagementEventType, EngagementChannel } from './engagement-types';

export class Phase11CommercialVerify {
    async runFullSuite() {
        console.log('ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Starting Phase 11 End-to-End Commercial Verification...');

        const results: Array<{
            step: string;
            status: 'PASS' | 'FAIL';
            reason?: string;
            error?: string;
        }> = [];

        const fixture = {
            companyId: crypto.randomUUID(),
            contactId: crypto.randomUUID(),
            leadId: crypto.randomUUID(),
            solutionId: crypto.randomUUID(),
            solutionArchitectureId: crypto.randomUUID(),
            workflowVersionId: crypto.randomUUID(),
            userId: crypto.randomUUID()
        };

        try {
            // -------------------------------------------------------------
            // STEP 0: Real E2E fixture
            // -------------------------------------------------------------
            console.log('Preparing real Phase 11 E2E fixture...');

            await db.query(
                `INSERT INTO "companies"
                    ("id", "name", "domain", "industry", "created_at", "updated_at")
                 VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                [
                    fixture.companyId,
                    `Operix Phase 11 Test Company ${fixture.companyId.slice(0, 8)}`,
                    `phase11-${fixture.companyId.slice(0, 8)}.test`,
                    'Automation'
                ]
            );

            await db.query(
                `INSERT INTO "contacts"
                    ("id", "company_id", "first_name", "last_name", "email", "role",
                     "seniority", "is_primary_decision_maker", "created_at")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [
                    fixture.contactId,
                    fixture.companyId,
                    'Phase11',
                    'Test',
                    `phase11-${fixture.contactId.slice(0, 8)}@example.test`,
                    'Owner',
                    'EXECUTIVE',
                    true
                ]
            );

            await db.query(
                `INSERT INTO "leads"
                    ("id", "company_id", "contact_id", "status",
                     "lead_score", "intent_score", "intent_status",
                     "created_at", "updated_at")
                 VALUES ($1, $2, $3, 'QUALIFIED', 90, 90, 'HIGH', NOW(), NOW())`,
                [
                    fixture.leadId,
                    fixture.companyId,
                    fixture.contactId
                ]
            );

            await db.query(
                `INSERT INTO "solutions"
                    ("id", "company_id", "name", "description", "solution_type", "created_at")
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [
                    fixture.solutionId,
                    fixture.companyId,
                    'Phase 11 Automation Solution',
                    'Deterministic E2E verification solution.',
                    'AUTOMATION'
                ]
            );

            await db.query(
                `INSERT INTO "solution_architectures"
                    ("id", "lead_id", "strategy", "blueprint", "version", "status", "created_at")
                 VALUES ($1, $2, $3, $4, 1, 'APPROVED', NOW())`,
                [
                    fixture.solutionArchitectureId,
                    fixture.leadId,
                    'REUSE',
                    JSON.stringify({
                        source: 'phase-11-e2e',
                        strategy: 'reuse'
                    })
                ]
            );

            await db.query(
                `INSERT INTO "workflow_versions"
                    ("id", "solution_id", "version_number", "content_hash",
                     "status", "origin_type", "change_summary",
                     "is_immutable", "created_at", "created_by")
                 VALUES ($1, $2, 1, $3, 'APPROVED', 'E2E_TEST', $4, false, NOW(), $5)`,
                [
                    fixture.workflowVersionId,
                    fixture.solutionId,
                    crypto
                        .createHash('sha256')
                        .update(`phase11-${fixture.workflowVersionId}`)
                        .digest('hex'),
                    'Phase 11 E2E fixture workflow version',
                    fixture.userId
                ]
            );

            results.push({
                step: 'P11S0: Real E2E Fixture',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 1: Commercial Foundation
            // -------------------------------------------------------------
            console.log('Testing Step 1: Commercial Foundation...');

            const pkg =
                await commercialFoundationService.createCommercialPackage({
                    leadId: fixture.leadId,
                    companyId: fixture.companyId,
                    contactId: fixture.contactId,
                    solutionArchitectureId: fixture.solutionArchitectureId,
                    solutionVersionId: fixture.workflowVersionId,
                    userId: fixture.userId,
                    currency: 'EGP'
                });

            results.push({
                step: 'P11S1: Package Creation',
                status: 'PASS'
            });

            const pricing =
                await commercialFoundationService.createPricingRecommendation({
                    commercialPackageId: pkg.commercialPackageId,
                    solutionArchitectureId: fixture.solutionArchitectureId,
                    solutionVersionId: fixture.workflowVersionId,
                    recommendedPrice: 10000,
                    costFloor: 4000,
                    targetPrice: 10000,
                    userId: fixture.userId,
                    currency: 'EGP',
                    reasoning: 'Phase 11 deterministic E2E pricing.',
                    assumptions: 'E2E test fixture.',
                    riskFactors: 'None for deterministic test.'
                });

            results.push({
                step: 'P11S1: Pricing Recommendation',
                status: 'PASS'
            });

            const offer =
                await commercialFoundationService.createOfferOption({
                    commercialPackageId: pkg.commercialPackageId,
                    name: 'Phase 11 E2E Automation Offer',
                    setupFee: 5000,
                    recurringFee: 1000,
                    userId: fixture.userId,
                    billingCycle: BillingCycle.MONTHLY,
                    currency: 'EGP',
                    description: 'Phase 11 deterministic E2E offer.',
                    includedScope: ['Core Workflow Automation'],
                    optionalScope: ['Advanced Analytics'],
                    outOfScope: ['Legacy Hardware Maintenance']
                });

            // Proposal and handoff require a usable commercial offer.
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

            results.push({
                step: 'P11S1: Offer Creation',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 2: Proposal Engine
            // -------------------------------------------------------------
            console.log('Testing Step 2: Proposal Engine...');

            const proposal = await proposalService.generateProposal({
                createdBy: fixture.userId,
                commercialPackageId: pkg.commercialPackageId,
                companyContext: {
                    companyId: fixture.companyId,
                    leadId: fixture.leadId
                },
                contactContext: {
                    contactId: fixture.contactId
                },
                solutionVersionId: fixture.workflowVersionId,
                requirementsVersionId: null as unknown as string,
                painVersionId: null as unknown as string,
                qualificationVersionId: null as unknown as string,
                pricingRecommendationId: pricing.pricingId,
                offerOptionId: offer.offerId,
                terms: 'Standard Phase 11 E2E terms.',
                generationRulesVersion: 'v1'
            });

            results.push({
                step: 'P11S2: Proposal Generation',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            const p11VersionCheck = await db.proposal_versions.findUnique({ where: { id: proposal.proposalVersionId } });
            console.log('P11 VERSION CHECK:', JSON.stringify({ proposalId: proposal.proposalId, proposalVersionId: proposal.proposalVersionId, versionParentProposalId: p11VersionCheck?.proposal_id }, null, 2));
            // STEP 3: Commercial Governance
            // -------------------------------------------------------------
            console.log('Testing Step 3: Commercial Governance...');

            const approvalId = await commercialGovernanceService.requestProposalApproval(
                proposal.proposalId,
                fixture.userId
            );

            await commercialGovernanceService.approveArtifact(
                approvalId,
                fixture.userId,
                'Phase 11 E2E human approval'
            );

            const approvalCheck =
                await commercialGovernanceService.verifyApproval(
                    proposal.proposalId
                );

            if (!approvalCheck.approved) {
                throw new Error(
                    'PROPOSAL_APPROVAL_FAILED: Proposal was not approved.'
                );
            }

            results.push({
                step: 'P11S3: Proposal Approval',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 4: Engagement & Intent
            // -------------------------------------------------------------
            console.log('Testing Step 4: Engagement & Intent...');

            const event = await engagementService.recordEvent({
                leadId: fixture.leadId,
                proposalId: proposal.proposalId,
                eventType: EngagementEventType.MEETING_BOOKED,
                channel: EngagementChannel.CALENDAR
            });

            await commercialEngagementIntentAdapter.processEngagementToIntent(
                event
            );

            results.push({
                step: 'P11S4: Engagement to Intent',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 5: Agreement
            // -------------------------------------------------------------
            console.log('Testing Step 5: Agreement & Payment...');

            const agreement = await agreementService.createAgreement({
                commercialPackageId: pkg.commercialPackageId,
                offerOptionId: offer.offerId,
                proposalVersionId: proposal.proposalVersionId,
                solutionVersionId: fixture.workflowVersionId,
                companyId: fixture.companyId,
                createdBy: fixture.userId
            });

            results.push({
                step: 'P11S5: Agreement Creation',
                status: 'PASS'
            });

            await agreementService.recordAcceptance({
                agreementId: agreement.agreementId,
                actorId: fixture.userId,
                actorType: 'CLIENT',
                evidence: 'PHASE11_E2E_ACCEPTANCE'
            });

            results.push({
                step: 'P11S5: Agreement Acceptance',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 6: Payment lifecycle
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
                clientReference: `PHASE11-${payment.paymentId}`
            });

            results.push({
                step: 'P11S5: Payment Submission',
                status: 'PASS'
            });

            await paymentVerificationService.verifyPayment({
                paymentId: payment.paymentId,
                verifiedAmount: 5000,
                verifiedBy: fixture.userId,
                decision: 'VERIFY'
            });

            results.push({
                step: 'P11S5: Human Verification',
                status: 'PASS'
            });

            const readiness =
                await paymentReadinessService.evaluateReadiness(
                    agreement.agreementId,
                    proposal.proposalId
                );

            if (readiness.status !== 'VERIFIED') {
                throw new Error(
                    `PAYMENT_READINESS_FAILED: ${readiness.status}`
                );
            }

            results.push({
                step: 'P11S5: Payment Readiness',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // STEP 7: Real Commercial -> Project Handoff
            // -------------------------------------------------------------
            console.log('Testing Step 7: Commercial Project Handoff...');

            const handoff =
                await commercialProjectHandoffService.handoff({
                    proposalId: proposal.proposalId,
                    readinessStatus: readiness.status,
                    actorId: fixture.userId
                });

            if (!handoff.contractId || !handoff.projectId) {
                throw new Error(
                    'PROJECT_HANDOFF_FAILED: Contract or Project was not created.'
                );
            }

            results.push({
                step: 'P11S6: Commercial Project Handoff',
                status: 'PASS'
            });

            // -------------------------------------------------------------
            // FINAL GATE: Project Start Eligibility
            // -------------------------------------------------------------
            console.log('Testing Project Start Eligibility...');

            const eligibility =
                await projectStartEligibilityGate.checkEligibility(
                    handoff.projectId
                );

            if (!eligibility.eligible) {
                throw new Error(
                    `PROJECT_START_ELIGIBILITY_FAILED: ${eligibility.reason}`
                );
            }

            results.push({
                step: 'FINAL: Project Start Eligibility',
                status: 'PASS'
            });
        } catch (e: unknown) {
            console.error('ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Suite crashed:', e);

            const error =
                e instanceof Error
                    ? e.message
                    : String(e);

            results.push({
                step: 'CRASH',
                status: 'FAIL',
                error
            });
        }

        return results;
    }
}

export const phase11CommercialVerify =
    new Phase11CommercialVerify();


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
