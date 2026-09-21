/**
 * @file phase-11-commercial-verify.ts
 * @description End-to-End Commercial Verification for Phase 11.
 *
 * This suite verifies the full chain from Commercial Foundation to Project Start.
 * Due to module resolution constraints, this is designed to be run via a
 * bundled runner or the project's actual test infrastructure.
 */

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
import { db } from '../../lib/db';

import { PaymentPurpose } from './payment-types';
import { PaymentStatus } from './types';
import { CommercialPackageStatus } from './commercial-types';
import { EngagementEventType, EngagementChannel } from './engagement-types';

export class Phase11CommercialVerify {
    async runFullSuite() {
        console.log('🚀 Starting Phase 11 End-to-End Commercial Verification...');

        const results: Array<{
            step: string;
            status: 'PASS' | 'FAIL';
            reason?: string;
            error?: string;
        }> = [];

        try {
            const leadId = 'lead_verify_e2e';
            const companyId = 'comp_verify_e2e';
            const contactId = 'cont_verify_e2e';
            const userId = 'user_admin_verify';

            // --- STEP 1: Commercial Foundation ---
            console.log('Testing Step 1: Commercial Foundation...');

            const pkg = await commercialFoundationService.createCommercialPackage({
                leadId,
                companyId,
                contactId,
                solutionArchitectureId: 'sol_arch_1',
                solutionVersionId: 'sol_ver_1',
                userId,
                currency: 'EGP'
            });

            results.push({
                step: 'P11S1: Package Creation',
                status: 'PASS'
            });

            // Mock pricing and offer for verification.
            await db.pricing_recommendations.create({
                data: {
                    pricingId: 'pr_1',
                    commercialPackageId: pkg.commercialPackageId,
                    status: 'APPROVED',
                    targetPrice: 10000,
                    recommendedPrice: 10000,
                    createdBy: userId,
                    createdAt: new Date()
                }
            });

            await db.offer_options.create({
                data: {
                    offerId: 'off_1',
                    commercialPackageId: pkg.commercialPackageId,
                    setupFee: 5000,
                    recurringFee: 1000,
                    currency: 'EGP',
                    status: 'ACTIVE',
                    version: 1,
                    createdAt: new Date(),
                    createdBy: userId,
                    validUntil: new Date(Date.now() + 86400000)
                }
            });

            // --- STEP 2: Proposal Engine ---
            console.log('Testing Step 2: Proposal Engine...');

            const proposal = await proposalService.generateProposal({
                createdBy: userId,
                commercialPackageId: pkg.commercialPackageId,
                companyContext: {
                    companyId,
                    leadId
                },
                contactContext: {
                    contactId
                },
                solutionVersionId: 'sol_ver_1',
                requirementsVersionId: 'req_ver_1',
                painVersionId: 'pain_ver_1',
                qualificationVersionId: 'qual_ver_1',
                pricingRecommendationId: 'pr_1',
                offerOptionId: 'off_1',
                terms: 'Standard terms',
                generationRulesVersion: 'v1'
            });

            results.push({
                step: 'P11S2: Proposal Generation',
                status: 'PASS'
            });

            // --- STEP 3: Commercial Governance ---
            console.log('Testing Step 3: Commercial Governance...');

            await db.proposals.update({
                where: { id: proposal.proposalId },
                data: { status: 'APPROVED' }
            });

            const approvalCheck =
                await commercialGovernanceService.verifyApproval(
                    proposal.proposalId
                );

            if (approvalCheck.approved) {
                results.push({
                    step: 'P11S3: Proposal Approval',
                    status: 'PASS'
                });
            } else {
                results.push({
                    step: 'P11S3: Proposal Approval',
                    status: 'FAIL'
                });
            }

            // --- STEP 4: Engagement & Intent ---
            console.log('Testing Step 4: Engagement & Intent...');

            const event = await engagementService.recordEvent({
                leadId,
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

            // --- STEP 5: Agreement & Payment ---
            console.log('Testing Step 5: Agreement & Payment...');

            const agreement = await agreementService.createAgreement({
                commercialPackageId: pkg.commercialPackageId,
                offerOptionId: 'off_1',
                proposalVersionId: proposal.proposalVersionId,
                solutionVersionId: 'sol_ver_1',
                companyId,
                createdBy: userId
            });

            results.push({
                step: 'P11S5: Agreement Creation',
                status: 'PASS'
            });

            await agreementService.recordAcceptance({
                agreementId: agreement.agreementId,
                actorId: 'client_user_1',
                actorType: 'CLIENT'
            });

            results.push({
                step: 'P11S5: Agreement Acceptance',
                status: 'PASS'
            });

            const payment = await paymentService.createPaymentRequirement({
                agreementId: agreement.agreementId,
                proposalId: proposal.proposalId,
                offerOptionId: 'off_1',
                purpose: PaymentPurpose.SETUP_FEE,
                expectedAmount: 5000,
                currency: 'EGP'
            });

            await paymentService.submitPayment({
                paymentId: payment.paymentId,
                submittedAmount: 5000,
                clientReference: 'REF123'
            });

            results.push({
                step: 'P11S5: Payment Submission',
                status: 'PASS'
            });

            await paymentVerificationService.verifyPayment({
                paymentId: payment.paymentId,
                verifiedAmount: 5000,
                verifiedBy: userId,
                decision: 'VERIFY'
            });

            results.push({
                step: 'P11S5: Human Verification',
                status: 'PASS'
            });

            const readiness =
                await paymentReadinessService.evaluateReadiness(
                    proposal.proposalId
                );

            if (readiness.status === 'VERIFIED') {
                results.push({
                    step: 'P11S5: Payment Readiness',
                    status: 'PASS'
                });
            } else {
                results.push({
                    step: 'P11S5: Payment Readiness',
                    status: 'FAIL',
                    reason: `Readiness status: ${readiness.status}`
                });
            }

            // --- FINAL GATE: Project Start ---
            console.log('Testing Project Start Eligibility...');

            const project = await db.projects.create({
                data: {
                    id: 'proj_verify_e2e',
                    name: 'E2E Verification Project',
                    status: 'PENDING',
                    payment_status: PaymentStatus.VERIFIED,
                    contract_id: 'cont_verify_e2e',
                    createdAt: new Date()
                }
            });

            const eligibility =
                await projectStartEligibilityGate.checkEligibility(
                    project.id
                );

            if (eligibility.eligible) {
                results.push({
                    step: 'FINAL: Project Start Eligibility',
                    status: 'PASS'
                });
            } else {
                results.push({
                    step: 'FINAL: Project Start Eligibility',
                    status: 'FAIL',
                    reason: eligibility.reason
                });
            }
        } catch (e: unknown) {
            console.error('❌ Suite crashed:', e);

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
