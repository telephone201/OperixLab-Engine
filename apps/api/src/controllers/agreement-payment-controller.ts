/**
 * @file agreement-payment-controller.ts
 * @description Controller for Agreement Management and Payment Verification.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';
import { agreementService } from '../services/projects/agreement-service';
import { paymentService } from '../services/projects/payment-service';
import { paymentVerificationService } from '../services/projects/payment-verification-service';
import { paymentReadinessService } from '../services/projects/payment-readiness-service';
import { projectStartEligibilityGate } from '../services/projects/eligibility-gate';
import { projectService } from '../services/projects/project-service';
import { commercialProjectHandoffService } from '../services/projects/commercial-project-handoff-service';
import { ProjectStatus } from '../services/projects/types';

export class AgreementPaymentController {
    /**
     * GET /api/commercial/leads/:leadId/agreement
     * Returns the active agreement and payment status for a lead.
     */
    async getAgreementContext(req: Request, res: Response) {
        try {
            const { leadId } = req.params;

            const commercialPackage = await db.commercial_packages.findFirst({
                where: { lead_id: leadId },
                orderBy: { created_at: 'desc' }
            });

            if (!commercialPackage) {
                return res.status(404).json({
                    error: { code: 'AGREEMENT_NOT_FOUND', message: 'No commercial package found for this lead' }
                });
            }

            const agreement = await db.commercial_agreements.findFirst({
                where: { commercial_package_id: commercialPackage.id },
                orderBy: { created_at: 'desc' }
            });

            if (!agreement) {
                return res.status(404).json({
                    error: { code: 'AGREEMENT_NOT_FOUND', message: 'No agreement found for this lead' }
                });
            }

            const payments = await db.payments.findMany({
                where: { agreement_id: agreement.id }
            });

            const proposalVersion = await db.proposal_versions.findUnique({
                where: { id: agreement.proposal_version_id }
            });

            if (!proposalVersion) {
                return res.status(404).json({
                    error: { code: 'PROPOSAL_VERSION_NOT_FOUND', message: 'Agreement proposal version was not found' }
                });
            }

            const readiness = await paymentReadinessService.evaluateReadiness(
                agreement.id,
                proposalVersion.proposal_id
            );

            return res.json({
                data: {
                    agreement: agreement,
                    payments: payments,
                    readiness: readiness
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/commercial/payment-destinations
     * Returns configured manual payment destinations.
     */
    async getPaymentDestinations(req: Request, res: Response) {
        try {
            const destinations = await paymentService.getPaymentDestinations();
            return res.json({ data: destinations });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * POST /api/commercial/payments/submit
     * Records a client payment submission.
     */
    async submitPayment(req: Request, res: Response) {
        try {
            const { paymentId, submittedAmount, clientReference, evidenceRef } = req.body;
            const payment = await paymentService.submitPayment({
                paymentId,
                submittedAmount,
                clientReference,
                evidenceRef
            });
            return res.json({ data: payment });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'SUBMISSION_FAILED', message: error.message }
            });
        }
    }

    /**
     * POST /api/commercial/payments/verify
     * Human verification of payment.
     */
    async verifyPayment(req: Request, res: Response) {
        try {
            const { paymentId, verifiedAmount, verifiedBy, decision, reason } = req.body;
            const result = await paymentVerificationService.verifyPayment({
                paymentId,
                verifiedAmount,
                verifiedBy,
                decision,
                reason
            });

            const readiness = await paymentReadinessService.evaluateReadiness(
                result.agreementId,
                result.proposalId
            );

            let handoff = null;

            if (readiness.status === 'VERIFIED') {
                handoff = await commercialProjectHandoffService.handoff({
                    proposalId: result.proposalId,
                    readinessStatus: readiness.status,
                    actorId: String(verifiedBy)
                });
            }

            return res.json({
                data: {
                    verification: result,
                    readiness,
                    handoff
                }
            });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'VERIFICATION_FAILED', message: error.message }
            });
        }
    }

    /**
     * GET /api/commercial/leads/:leadId/eligibility
     * Checks if the project is eligible to start.
     */
    async checkProjectEligibility(req: Request, res: Response) {
        try {
            const { leadId } = req.params;

            const commercialPackage = await db.commercial_packages.findFirst({
                where: { lead_id: leadId },
                orderBy: { created_at: 'desc' }
            });

            if (!commercialPackage) {
                return res.status(404).json({
                    error: { code: 'PROJECT_NOT_FOUND', message: 'No project found for this lead' }
                });
            }

            const proposal = await db.proposals.findFirst({
                where: { commercial_package_id: commercialPackage.id },
                orderBy: { version: 'desc' }
            });

            if (!proposal) {
                return res.status(404).json({
                    error: { code: 'PROJECT_NOT_FOUND', message: 'No project found for this lead' }
                });
            }

            const contract = await db.contracts.findFirst({
                where: { proposal_id: proposal.id },
                orderBy: { created_at: 'desc' }
            });

            if (!contract) {
                return res.status(404).json({
                    error: { code: 'PROJECT_NOT_FOUND', message: 'No project found for this lead' }
                });
            }

            const project = await db.projects.findFirst({
                where: { contract_id: contract.id }
            });

            if (!project) {
                return res.status(404).json({
                    error: { code: 'PROJECT_NOT_FOUND', message: 'No project found for this lead' }
                });
            }

            const result = await projectStartEligibilityGate.checkEligibility(project.id);
            return res.json({ data: result });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * POST /api/commercial/projects/start
     * Transitions project to STARTED state.
     */
    async startProject(req: Request, res: Response) {
        try {
            const { projectId, userId } = req.body;

            // Re-verify eligibility at execution time
            const eligibility = await projectStartEligibilityGate.checkEligibility(projectId);
            if (!eligibility.eligible) {
                return res.status(403).json({
                    error: { code: 'ELIGIBILITY_BLOCKED', message: eligibility.reason }
                });
            }

            const project = await projectService.getProject(String(projectId));

            await projectService.transitionState({
                projectId: String(projectId),
                fromState: project.status,
                toState: ProjectStatus.STARTED,
                reason: 'Project started after eligibility verification',
                actorId: String(userId)
            });

            return res.json({ data: { status: 'STARTED' } });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'START_FAILED', message: error.message }
            });
        }
    }
}