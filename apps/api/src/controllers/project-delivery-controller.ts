/**
 * @file project-delivery-controller.ts
 * @description Controller for Project Delivery, Governance, and Completion.
 */

import { Request, Response } from 'express';
import { db } from '../lib/db';
import { projectService } from '../services/projects/project-service';
import { deliveryPlanService } from '../services/projects/delivery-plan-service';
import { scopeManager } from '../services/projects/scope-manager';
import { reviewService } from '../services/projects/review-service';
import { handoverService } from '../services/projects/handover-service';
import { completionService } from '../services/projects/completion-service';

export class ProjectDeliveryController {
    /**
     * GET /api/projects
     * Lists all projects with their current delivery state.
     */
    async getProjects(req: Request, res: Response) {
        try {
            const projects = await db.projects.findMany({
                orderBy: { created_at: 'desc' }
            });

            return res.json({
                data: projects.map(p => ({
                    projectId: p.id,
                    name: p.name,
                    status: p.status,
                    paymentStatus: p.payment_status,
                    startDate: p.start_date,
                    createdAt: p.created_at
                }))
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/projects/:projectId
     * Returns the full delivery context for a project.
     */
    async getProjectDetail(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const project = await projectService.getProject(projectId);

            // Gather aggregated delivery data
            const [plan, scope, review, handover, completion] = await Promise.all([
                db.delivery_plans.findFirst({ where: { project_id: projectId }, orderBy: { plan_version: 'desc' } }),
                db.scope_baselines.findFirst({ where: { project_id: projectId }, orderBy: { version: 'desc' } }),
                db.review_sessions.findFirst({ where: { project_id: projectId }, orderBy: { review_version: 'desc' } }),
                db.handovers.findFirst({ where: { project_id: projectId }, orderBy: { handover_version: 'desc' } }),
                db.completion_readiness.findFirst({ where: { project_id: projectId }, orderBy: { created_at: 'desc' } })
            ]);

            return res.json({
                data: {
                    project,
                    deliveryPlan: plan,
                    scopeBaseline: scope,
                    reviewSession: review,
                    handover: handover,
                    completionReadiness: completion
                }
            });
        } catch (error: any) {
            if (error?.message === 'PROJECT_NOT_FOUND') {
                return res.status(404).json({
                    error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }
                });
            }

            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/projects/:projectId/plan
     * Returns milestones and tasks for the active delivery plan.
     */
    async getDeliveryPlan(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const plan = await db.delivery_plans.findFirst({ where: { project_id: projectId, status: 'ACTIVE' } });

            if (!plan) {
                return res.status(404).json({
                    error: { code: 'PLAN_NOT_FOUND', message: 'No active delivery plan found' }
                });
            }

            const milestones = await db.delivery_milestones.findMany({
                where: { plan_id: plan.id },
                orderBy: { order_index: 'asc' }
            });

            const tasks = await db.delivery_tasks.findMany({
                where: { plan_id: plan.id },
                orderBy: { created_at: 'asc' }
            });

            return res.json({
                data: {
                    plan,
                    milestones,
                    tasks
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/projects/:projectId/scope
     * Returns the scope baseline and current items.
     */
    async getScope(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const baseline = await db.scope_baselines.findFirst({
                where: { project_id: projectId },
                orderBy: { version: 'desc' }
            });

            if (!baseline) {
                return res.status(404).json({
                    error: { code: 'SCOPE_NOT_FOUND', message: 'No scope baseline found' }
                });
            }

            const items = await db.scope_items.findMany({
                where: { scope_baseline_id: baseline.id }
            });

            const changeRequests = await db.change_requests.findMany({
                where: { project_id: projectId },
                orderBy: { created_at: 'desc' }
            });

            return res.json({
                data: {
                    baseline,
                    items,
                    changeRequests
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/projects/:projectId/review
     * Returns review session and findings.
     */
    async getReviewSession(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const session = await db.review_sessions.findFirst({
                where: { project_id: projectId },
                orderBy: { review_version: 'desc' }
            });

            if (!session) {
                return res.status(404).json({
                    error: { code: 'REVIEW_NOT_FOUND', message: 'No review session found' }
                });
            }

            const items = await db.review_items.findMany({ where: { review_session_id: session.id } });
            const findings = await db.review_findings.findMany({ where: { review_session_id: session.id } });
            const feedback = await db.review_feedback.findMany({ where: { review_session_id: session.id } });

            return res.json({
                data: {
                    session,
                    items,
                    findings,
                    feedback
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/projects/:projectId/handover
     * Returns handover status and checklist.
     */
    async getHandover(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const handover = await db.handovers.findFirst({
                where: { project_id: projectId },
                orderBy: { handover_version: 'desc' }
            });

            if (!handover) {
                return res.status(404).json({
                    error: { code: 'HANDOVER_NOT_FOUND', message: 'No handover record found' }
                });
            }

            const items = await db.handover_items.findMany({
                where: { handover_id: handover.id }
            });

            return res.json({
                data: {
                    handover,
                    items
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * POST /api/projects/transition
     * Transitions project state.
     */
    async transitionProject(req: Request, res: Response) {
        try {
            const { projectId, toState, reason, actorId } = req.body;

            const project = await projectService.getProject(String(projectId));

            await projectService.transitionState({
                projectId: String(projectId),
                fromState: project.status,
                toState,
                reason,
                actorId
            });

            return res.json({ data: { status: 'TRANSITIONED', newState: toState } });
        } catch (error: any) {
            return res.status(400).json({
                error: { code: 'TRANSITION_FAILED', message: error.message }
            });
        }
    }
}