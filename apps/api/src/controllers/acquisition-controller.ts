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
            const leads = await db.leads.findMany({
                take: 100,
                orderBy: { created_at: 'desc' }
            });

            const enrichedLeads = await Promise.all(
                leads.map(async (lead: any) => {
                    const company = lead.company_id
                        ? await db.companies.findUnique({
                            where: { id: lead.company_id }
                        })
                        : null;

                    const contact = lead.contact_id
                        ? await db.contacts.findUnique({
                            where: { id: lead.contact_id }
                        })
                        : null;

                    const source = lead.source_id
                        ? await db.lead_sources.findUnique({
                            where: { id: lead.source_id }
                        })
                        : null;

                    return {
                        ...lead,
                        company: company?.name || '',
                        contact: contact
                            ? [contact.first_name, contact.last_name]
                                .filter(Boolean)
                                .join(' ')
                            : '',
                        source: source?.name || ''
                    };
                })
            );

            return res.json({ data: enrichedLeads });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
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
                where: { id }
            });

            if (!lead) {
                return res.status(404).json({
                    error: { code: 'RESOURCE_NOT_FOUND', message: 'Lead not found' }
                });
            }

            const companyId = (lead as any).company_id;
            const contactId = (lead as any).contact_id;

            const company = companyId
                ? await db.companies.findUnique({ where: { id: companyId } })
                : null;

            const contact = contactId
                ? await db.contacts.findUnique({ where: { id: contactId } })
                : null;

            const source = (lead as any).source_id
                ? await db.lead_sources.findUnique({
                    where: { id: (lead as any).source_id }
                })
                : null;

            return res.json({
                data: {
                    ...lead,
                    company: company?.name || '',
                    contact: contact
                        ? [contact.first_name, contact.last_name]
                            .filter(Boolean)
                            .join(' ')
                        : '',
                    source: source?.name || ''
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
            });
        }
    }
}

