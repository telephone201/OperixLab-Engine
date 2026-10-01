import { Router } from 'express';
import { AcquisitionController } from '../controllers/acquisition-controller';
import { ResearchController } from '../controllers/research-controller';
import { QualificationController } from '../controllers/qualification-controller';
import { PainController } from '../controllers/pain-controller';
import { RequirementsController } from '../controllers/requirements-controller';
import { CommercialController } from '../controllers/commercial-controller';
import { AgreementPaymentController } from '../controllers/agreement-payment-controller';
import { ProjectDeliveryController } from '../controllers/project-delivery-controller';
import { NotificationsController } from '../controllers/notifications-controller';
import { ApprovalsController } from '../controllers/approvals-controller';
import { PaymentReviewController } from '../controllers/payment-review-controller';
import { matchingReviewController } from '../controllers/matching-review-controller';
import { matchingReadController } from '../controllers/matching-read-controller';
import { matchingHandoffController } from '../controllers/matching-handoff-controller';
import { PricingReviewController } from '../controllers/pricing-review-controller';
import { ProposalReviewController } from '../controllers/proposal-review-controller';
import { DashboardSummaryController } from '../controllers/dashboard-summary-controller';
import { AuthController } from '../controllers/auth-controller';
import { publicProposalController } from '../controllers/public-proposal-controller';
import { chatController } from '../controllers/chat-controller';
import { requireAuth, requireRole } from '../middleware/auth-middleware';
import { mappingReviewController } from '../controllers/mapping-review-controller';
import { ingestionController } from '../controllers/ingestion-controller';
import multer from 'multer';
import os from 'os';

const apiRouter = Router();

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Auth
const authCtrl = new AuthController();

apiRouter.post('/auth/login', (req, res) => authCtrl.login(req, res));
apiRouter.post('/auth/logout', requireAuth, (req, res) => authCtrl.logout(req, res));

// Public client proposal share links (HMAC-signed, unauthenticated)
apiRouter.get('/public/proposals/:versionId', (req, res) => publicProposalController.getProposal(req, res));
apiRouter.post('/public/proposals/:versionId/response', (req, res) => publicProposalController.submitResponse(req, res));

// Instantiate Controllers
const acquisitionCtrl = new AcquisitionController();
const researchCtrl = new ResearchController();
const qualificationCtrl = new QualificationController();
const painCtrl = new PainController();
const requirementsCtrl = new RequirementsController();
const commercialCtrl = new CommercialController();
const agreementPaymentCtrl = new AgreementPaymentController();
const projectDeliveryCtrl = new ProjectDeliveryController();
const notificationsCtrl = new NotificationsController();
const approvalsCtrl = new ApprovalsController();
const paymentReviewCtrl = new PaymentReviewController();
const pricingReviewController = new PricingReviewController();
const proposalReviewController = new ProposalReviewController();
const dashboardSummaryController = new DashboardSummaryController();

 // Chat Routes
apiRouter.post('/chat/instructions', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => chatController.createInstruction(req, res));
apiRouter.post('/chat/instructions/:id/confirm', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => chatController.confirmInstruction(req, res));
apiRouter.get('/chat/instructions', requireAuth, (req, res) => chatController.listInstructions(req, res));
apiRouter.get('/chat/instructions/:id', requireAuth, (req, res) => chatController.getInstruction(req, res));
// Lead / Acquisition Routes
apiRouter.get('/leads', requireAuth, (req, res) => acquisitionCtrl.getLeads(req, res));
apiRouter.get('/leads/:id', requireAuth, (req, res) => acquisitionCtrl.getLeadById(req, res));

// Research Routes
apiRouter.get('/leads/:id/research', requireAuth, (req, res) => researchCtrl.getResearch(req, res));
apiRouter.post('/leads/:id/research', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => researchCtrl.createResearchTask(req, res));
apiRouter.post('/leads/:id/research/result', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => researchCtrl.submitResearchResult(req, res));

// Qualification Routes
apiRouter.get('/leads/:id/qualification', requireAuth, (req, res) => qualificationCtrl.getQualification(req, res));
apiRouter.post('/leads/:id/qualification', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => qualificationCtrl.calculateQualification(req, res));

// Pain Analysis Routes
apiRouter.get('/leads/:id/pain', requireAuth, (req, res) => painCtrl.getPainAnalysis(req, res));
apiRouter.post('/leads/:id/pain', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => painCtrl.initiatePainAnalysis(req, res));
apiRouter.post('/leads/:id/pain/result', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => painCtrl.submitPainResult(req, res));

// Requirements Routes
apiRouter.get('/leads/:id/requirements', requireAuth, (req, res) => requirementsCtrl.getRequirements(req, res));
apiRouter.post('/leads/:id/requirements', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => requirementsCtrl.initiateRequirementsAnalysis(req, res));
apiRouter.post('/leads/:id/requirements/result', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => requirementsCtrl.submitRequirementsResult(req, res));

// Commercial Management Routes
apiRouter.get('/commercial/leads', requireAuth, (req, res) => commercialCtrl.getCommercialPipeline(req, res));
apiRouter.get('/commercial/leads/:leadId', requireAuth, (req, res) => commercialCtrl.getLeadCommercialContext(req, res));
apiRouter.get('/commercial/leads/:leadId/proposal-preview', requireAuth, (req, res) => commercialCtrl.getProposalPreview(req, res));
apiRouter.post('/commercial/pricing/approve', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => commercialCtrl.approvePricing(req, res));
apiRouter.post('/commercial/proposal/approve', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => commercialCtrl.approveProposal(req, res));

// Agreement & Payment Routes
apiRouter.get('/commercial/leads/:leadId/agreement', requireAuth, (req, res) => agreementPaymentCtrl.getAgreementContext(req, res));
apiRouter.get('/commercial/payment-destinations', requireAuth, (req, res) => agreementPaymentCtrl.getPaymentDestinations(req, res));
apiRouter.post('/commercial/payments/submit', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => agreementPaymentCtrl.submitPayment(req, res));
apiRouter.post('/commercial/payments/verify', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => agreementPaymentCtrl.verifyPayment(req, res));
apiRouter.get('/commercial/leads/:leadId/eligibility', requireAuth, (req, res) => agreementPaymentCtrl.checkProjectEligibility(req, res));
apiRouter.post('/commercial/projects/start', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => agreementPaymentCtrl.startProject(req, res));

// Notification Routes
apiRouter.get('/notifications', requireAuth, (req, res) => notificationsCtrl.getNotifications(req, res));
apiRouter.get('/governance/approvals', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => approvalsCtrl.getPendingApprovals(req, res));
apiRouter.get('/dashboard/payments/review', requireAuth, (req, res) => paymentReviewCtrl.getPendingReviews(req, res));
apiRouter.get('/dashboard/pricing/review', requireAuth, (req, res) => pricingReviewController.getPendingReviews(req, res));
apiRouter.get('/dashboard/proposals/review', requireAuth, (req, res) => proposalReviewController.getPendingReviews(req, res));
apiRouter.get('/dashboard/summary', requireAuth, (req, res) => dashboardSummaryController.getSummary(req, res));

// Matching Review Routes (STEP 5): human approve/reject of the persisted matching recommendation
apiRouter.post('/matching/review/:sessionId/approve', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => matchingReviewController.approveMatch(req, res));
apiRouter.post('/matching/review/:sessionId/reject', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => matchingReviewController.rejectMatch(req, res));

// Matching Read Routes (STEP 6): read-only surface over the persisted matching artifacts
apiRouter.get('/leads/:id/matching', requireAuth, (req, res) => matchingReadController.getLeadMatchingSessions(req, res));
apiRouter.get('/leads/:id/matching/sessions/:sessionId', requireAuth, (req, res) => matchingReadController.getMatchingSessionDetail(req, res));
apiRouter.post('/leads/:id/matching/run', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => matchingReviewController.runMatching(req, res));
apiRouter.post('/leads/:id/matching/sessions/:sessionId/handoff', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => matchingHandoffController.handoff(req, res));

// Mapping Review Session Routes: human review of purchased-source mapping
// previews (read-only over source files; approval never triggers import).
apiRouter.post('/acquisition/review-sessions', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.createSession(req, res));
apiRouter.get('/acquisition/review-sessions', requireAuth, (req, res) => mappingReviewController.listSessions(req, res));
apiRouter.get('/acquisition/review-sessions/:id', requireAuth, (req, res) => mappingReviewController.getSession(req, res));
apiRouter.patch('/acquisition/review-sessions/:id/mappings/:mappingId', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.updateMapping(req, res));
apiRouter.post('/acquisition/review-sessions/:id/sections/:sectionId/approve', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.approveSection(req, res));
apiRouter.post('/acquisition/review-sessions/:id/sections/:sectionId/reject', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.rejectSection(req, res));
apiRouter.post('/acquisition/review-sessions/:id/approve', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.approveSession(req, res));
apiRouter.post('/acquisition/review-sessions/:id/reject', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => mappingReviewController.rejectSession(req, res));
apiRouter.get('/acquisition/review-sessions/:id/source-integrity', requireAuth, (req, res) => mappingReviewController.verifySourceIntegrity(req, res));

// External Lead Ingestion & Staging Routes (Multipart upload, batch listing, approved promotion)
apiRouter.post('/acquisition/upload', requireAuth, requireRole('OWNER', 'OPERATOR'), upload.single('file'), (req, res) => ingestionController.upload(req, res));
apiRouter.get('/acquisition/batches', requireAuth, (req, res) => ingestionController.listBatches(req, res));
apiRouter.post('/acquisition/batches/:batchId/promote', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => ingestionController.promoteBatch(req, res));

// Project Delivery Routes
apiRouter.get('/projects', requireAuth, (req, res) => projectDeliveryCtrl.getProjects(req, res));
apiRouter.get('/projects/:projectId', requireAuth, (req, res) => projectDeliveryCtrl.getProjectDetail(req, res));
apiRouter.get('/projects/:projectId/plan', requireAuth, (req, res) => projectDeliveryCtrl.getDeliveryPlan(req, res));
apiRouter.get('/projects/:projectId/scope', requireAuth, (req, res) => projectDeliveryCtrl.getScope(req, res));
apiRouter.get('/projects/:projectId/review', requireAuth, (req, res) => projectDeliveryCtrl.getReviewSession(req, res));
apiRouter.get('/projects/:projectId/handover', requireAuth, (req, res) => projectDeliveryCtrl.getHandover(req, res));
apiRouter.post('/projects/transition', requireAuth, requireRole('OWNER', 'OPERATOR'), (req, res) => projectDeliveryCtrl.transitionProject(req, res));

export { apiRouter };
