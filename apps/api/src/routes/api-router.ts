/**
 * @file api-router.ts
 * @description Central routing table for the Operix API.
 */

import { Router } from 'express';
import { AcquisitionController } from '../controllers/acquisition-controller';
import { ResearchController } from '../controllers/research-controller';
import { QualificationController } from '../controllers/qualification-controller';
import { PainController } from '../controllers/pain-controller';
import { RequirementsController } from '../controllers/requirements-controller';
import { CommercialController } from '../controllers/commercial-controller';
import { AgreementPaymentController } from '../controllers/agreement-payment-controller';
import { ProjectDeliveryController } from '../controllers/project-delivery-controller';

const apiRouter = Router();

// Instantiate Controllers
const acquisitionCtrl = new AcquisitionController();
const researchCtrl = new ResearchController();
const qualificationCtrl = new QualificationController();
const painCtrl = new PainController();
const requirementsCtrl = new RequirementsController();
const commercialCtrl = new CommercialController();
const agreementPaymentCtrl = new AgreementPaymentController();
const projectDeliveryCtrl = new ProjectDeliveryController();

// Lead / Acquisition Routes
apiRouter.get('/leads', (req, res) => acquisitionCtrl.getLeads(req, res));
apiRouter.get('/leads/:id', (req, res) => acquisitionCtrl.getLeadById(req, res));

// Research Routes
apiRouter.get('/leads/:id/research', (req, res) => researchCtrl.getResearch(req, res));

// Qualification Routes
apiRouter.get('/leads/:id/qualification', (req, res) => qualificationCtrl.getQualification(req, res));

// Pain Analysis Routes
apiRouter.get('/leads/:id/pain', (req, res) => painCtrl.getPainAnalysis(req, res));

// Requirements Routes
apiRouter.get('/leads/:id/requirements', (req, res) => requirementsCtrl.getRequirements(req, res));

// Commercial Management Routes
apiRouter.get('/commercial/leads', (req, res) => commercialCtrl.getCommercialPipeline(req, res));
apiRouter.get('/commercial/leads/:leadId', (req, res) => commercialCtrl.getLeadCommercialContext(req, res));
apiRouter.get('/commercial/leads/:leadId/proposal-preview', (req, res) => commercialCtrl.getProposalPreview(req, res));
apiRouter.post('/commercial/pricing/approve', (req, res) => commercialCtrl.approvePricing(req, res));
apiRouter.post('/commercial/proposal/approve', (req, res) => commercialCtrl.approveProposal(req, res));

// Agreement & Payment Routes
apiRouter.get('/commercial/leads/:leadId/agreement', (req, res) => agreementPaymentCtrl.getAgreementContext(req, res));
apiRouter.get('/commercial/payment-destinations', (req, res) => agreementPaymentCtrl.getPaymentDestinations(req, res));
apiRouter.post('/commercial/payments/submit', (req, res) => agreementPaymentCtrl.submitPayment(req, res));
apiRouter.post('/commercial/payments/verify', (req, res) => agreementPaymentCtrl.verifyPayment(req, res));
apiRouter.get('/commercial/leads/:leadId/eligibility', (req, res) => agreementPaymentCtrl.checkProjectEligibility(req, res));
apiRouter.post('/commercial/projects/start', (req, res) => agreementPaymentCtrl.startProject(req, res));

// Project Delivery Routes
apiRouter.get('/projects', (req, res) => projectDeliveryCtrl.getProjects(req, res));
apiRouter.get('/projects/:projectId', (req, res) => projectDeliveryCtrl.getProjectDetail(req, res));
apiRouter.get('/projects/:projectId/plan', (req, res) => projectDeliveryCtrl.getDeliveryPlan(req, res));
apiRouter.get('/projects/:projectId/scope', (req, res) => projectDeliveryCtrl.getScope(req, res));
apiRouter.get('/projects/:projectId/review', (req, res) => projectDeliveryCtrl.getReviewSession(req, res));
apiRouter.get('/projects/:projectId/handover', (req, res) => projectDeliveryCtrl.getHandover(req, res));
apiRouter.post('/projects/transition', (req, res) => projectDeliveryCtrl.transitionProject(req, res));


export { apiRouter };
