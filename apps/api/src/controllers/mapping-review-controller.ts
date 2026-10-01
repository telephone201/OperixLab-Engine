import { Request, Response } from 'express';
import {
    mappingReviewSessionService,
    ReviewSessionError,
} from '../services/acquisition/external-lead-ingestion/mapping-review-session-service';

/**
 * Minimal HTTP surface for the purchased-lead Mapping Review Session.
 *
 * Conventions follow the existing controllers: `{ data }` success shape,
 * `{ error: { code, message } }` failure shape, requireAuth + requireRole
 * enforced at the router layer.
 *
 * Deliberately NO import endpoint exists here. Approving a session is a
 * review-workflow state only.
 */
export class MappingReviewController {
    private errorResponse(res: Response, error: unknown) {
        if (error instanceof ReviewSessionError) {
            const status =
                error.code === 'SESSION_NOT_FOUND' ||
                error.code === 'SECTION_NOT_FOUND'
                    ? 404
                    : error.code === 'SESSION_IMMUTABLE' ||
                        error.code === 'PROPOSAL_MISMATCH' ||
                        error.code === 'INVALID_FIELD' ||
                        error.code === 'SECTION_HAS_UNRESOLVED' ||
                        error.code === 'SESSION_HAS_UNRESOLVED'
                    ? 409
                    : 400;

            return res.status(status).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
        });
    }

    /**
     * POST /api/acquisition/review-sessions
     * Body: { preview, filePath, sourceChecksum?, batchId? }
     */
    async createSession(req: Request, res: Response) {
        try {
            const { preview, filePath, sourceChecksum, batchId } =
                req.body ?? {};

            if (!preview || !filePath) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_INPUT',
                        message: 'preview and filePath are required.',
                    },
                });
            }

            const session =
                await mappingReviewSessionService.createReviewSession(
                    {
                        preview,
                        filePath,
                        sourceChecksum,
                        batchId,
                        createdBy:
                            (req as any).user?.id ?? null,
                    },
                );

            return res.status(201).json({ data: session });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * GET /api/acquisition/review-sessions/:id
     */
    async getSession(req: Request, res: Response) {
        try {
            const detail =
                await mappingReviewSessionService.getReviewSession(
                    String(req.params.id),
                );

            if (!detail) {
                return res.status(404).json({
                    error: {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Review session not found.',
                    },
                });
            }

            return res.json({ data: detail });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * GET /api/acquisition/review-sessions
     */
    async listSessions(_req: Request, res: Response) {
        try {
            const sessions =
                await mappingReviewSessionService.listReviewSessions();

            return res.json({ data: sessions });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * PATCH /api/acquisition/review-sessions/:id/mappings/:mappingId
     * Body: { decision, approvedField?, reviewNote? }
     * mappingId is the section id (decisions are keyed by section+column).
     */
    async updateMapping(req: Request, res: Response) {
        try {
            const { decision, approvedField, reviewNote } =
                req.body ?? {};

            if (
                !['ACCEPT', 'CHANGE', 'REJECT'].includes(decision)
            ) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_INPUT',
                        message:
                            "decision must be one of ACCEPT, CHANGE, REJECT.",
                    },
                });
            }

            const decision_ =
                await mappingReviewSessionService.updateMappingDecision(
                    {
                        sessionId: String(req.params.id),
                        sectionId: String(req.params.mappingId),
                        sourceColumn: String(req.body?.sourceColumn),
                        decision,
                        approvedField:
                            approvedField ?? null,
                        reviewNote: reviewNote ?? null,
                        reviewedBy:
                            (req as any).user?.id ?? null,
                    },
                );

            return res.json({ data: decision_ });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * POST /api/acquisition/review-sessions/:id/sections/:sectionId/approve
     */
    async approveSection(req: Request, res: Response) {
        try {
            const section =
                await mappingReviewSessionService.approveSection({
                    sessionId: String(req.params.id),
                    sectionId: String(req.params.sectionId),
                    reviewedBy:
                        (req as any).user?.id ?? null,
                });

            return res.json({ data: section });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * POST /api/acquisition/review-sessions/:id/sections/:sectionId/reject
     */
    async rejectSection(req: Request, res: Response) {
        try {
            const section =
                await mappingReviewSessionService.rejectSection({
                    sessionId: String(req.params.id),
                    sectionId: String(req.params.sectionId),
                    reviewedBy:
                        (req as any).user?.id ?? null,
                });

            return res.json({ data: section });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * POST /api/acquisition/review-sessions/:id/approve
     */
    async approveSession(req: Request, res: Response) {
        try {
            const session =
                await mappingReviewSessionService.approveReviewSession(
                    {
                        sessionId: String(req.params.id),
                        reviewedBy:
                            (req as any).user?.id ?? null,
                    },
                );

            return res.json({ data: session });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * POST /api/acquisition/review-sessions/:id/reject
     */
    async rejectSession(req: Request, res: Response) {
        try {
            const session =
                await mappingReviewSessionService.rejectReviewSession(
                    {
                        sessionId: String(req.params.id),
                        reviewedBy:
                            (req as any).user?.id ?? null,
                    },
                );

            return res.json({ data: session });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }

    /**
     * GET /api/acquisition/review-sessions/:id/source-integrity
     * Read-only checksum verification of the reviewed source file.
     */
    async verifySourceIntegrity(req: Request, res: Response) {
        try {
            const result =
                await mappingReviewSessionService.verifySourceIntegrity(
                    String(req.params.id),
                );

            return res.json({ data: result });
        } catch (error) {
            return this.errorResponse(res, error);
        }
    }
}

export const mappingReviewController =
    new MappingReviewController();
