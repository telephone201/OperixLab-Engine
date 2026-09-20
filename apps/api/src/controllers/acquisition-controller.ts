/**
 * @file acquisition-controller.ts
 * @description Controller for lead acquisition and retrieval.
 */

import { Request, Response } from 'express';
import { acquisitionService } from '../services/acquisition/acquisition-service';
import { db } from '../lib/db';

export class AcquisitionController {
    /**
     * GET /api/leads
     * Returns a list of leads with basic info.
     */
    async getLeads(req: Request, res: Response) {
        try {
            // The service currently has import methods but not a generic 'list' method.
            // We retrieve from the db.leads table directly via the db client.
            const leads = await db.leads.findMany({
                take: 100, // Safe default pagination
                orderBy: { created_at: 'desc' }
            });

            return res.json({ data: leads });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }

    /**
     * GET /api/leads/:id
     * Returns full detail for a specific lead.
     */
    async getLeadById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const lead = await db.leads.findUnique({
                where: { id },
                include: {
                    company: true,
                    contact: true
                }
            });

            if (!lead) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Lead not found' }
                });
            }

            return res.json({ data: lead });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: error.message }
            });
        }
    }
}
