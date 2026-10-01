import { Request, Response } from 'express';
import fs from 'fs';
import { externalLeadIngestionOrchestrator } from '../services/acquisition/external-lead-ingestion/external-lead-ingestion-orchestrator';

export class IngestionController {
    /**
     * POST /api/acquisition/upload
     * Multipart file upload for CSV/XLSX leads.
     */
    async upload(req: Request, res: Response) {
        if (!req.file) {
            return res.status(400).json({
                error: {
                    code: 'FILE_REQUIRED',
                    message: 'No file uploaded. Please upload a .csv, .xlsx, or .xls file.'
                }
            });
        }

        const filePath = req.file.path;

        try {
            const batchName = req.body.batchName || req.file.originalname;
            const userId = (req as any).user?.id ?? null;

            const result = await externalLeadIngestionOrchestrator.ingestFile({
                filePath,
                originalFilename: req.file.originalname,
                batchName,
                userId
            });

            return res.status(201).json({
                data: result
            });
        } catch (error: any) {
            return res.status(500).json({
                error: {
                    code: 'INGESTION_FAILED',
                    message: error.message
                }
            });
        } finally {
            // Remove temporary upload file if exists
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch {
                    // Ignore temp file cleanup errors
                }
            }
        }
    }

    /**
     * POST /api/acquisition/batches/:batchId/promote
     * Promotes staged leads to live leads only after mapping review approval.
     */
    async promoteBatch(req: Request, res: Response) {
        try {
            const batchId = String(req.params.batchId);
            const userId = (req as any).user?.id ?? null;

            const result = await externalLeadIngestionOrchestrator.promoteApprovedBatch({
                batchId,
                userId
            });

            return res.json({
                data: result
            });
        } catch (error: any) {
            return res.status(400).json({
                error: {
                    code: 'PROMOTION_FAILED',
                    message: error.message
                }
            });
        }
    }

    /**
     * GET /api/acquisition/batches
     * Lists recent ingestion batches and linked review sessions.
     */
    async listBatches(req: Request, res: Response) {
        try {
            const limit = req.query.limit ? Number(req.query.limit) : 20;
            const batches = await externalLeadIngestionOrchestrator.listBatches(limit);

            return res.json({
                data: batches
            });
        } catch (error: any) {
            return res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error.message
                }
            });
        }
    }
}

export const ingestionController = new IngestionController();
