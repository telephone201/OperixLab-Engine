/**
 * @file lead-pain-context-assembler.ts
 * @description Assembles the canonical Research + Qualification context that
 * Pain analysis will consume. Single source of truth for Pain context:
 * Research data is read from the canonical persisted Research tables and
 * Qualification from QualificationVersionManager.getLatestResult(). Builds no
 * fake/default values: missing Research or Qualification raises a clear error.
 */

import { db } from '../../lib/db';
import { QualificationVersionManager } from '../qualification/qualification-version-manager';
import { QualificationResult } from '../qualification/qualification-types';
import { qualificationContextAdapter } from '../analysis/qualification-context-adapter';

const qualificationVersionManager = new QualificationVersionManager();

export interface PainContextEvidence {
    evidenceId: string;
    text: string;
    sourceUrl: string | null;
    timestamp: Date;
}

export interface PainResearchContext {
    researchId: string;
    researchVersionId: string;
    researchDataId: string;
    summary: string;
    evidence: PainContextEvidence[];
}

export interface PainQualificationContext {
    result: QualificationResult;
    version: number;
    /** Canonical qualifications.id (FK target for pain/task correlation). */
    qualificationVersionId: string;
    summary: string;
    commercialSignals: string[];
}

export interface LeadPainContext {
    leadId: string;
    company: {
        name: string;
        industry: string | null;
        website: string | null;
    };
    research: PainResearchContext;
    qualification: PainQualificationContext;
}

export class LeadPainContextAssembler {
    /**
     * Assembles the Pain context for a lead from canonical persisted data.
     * Throws RESEARCH_CONTEXT_NOT_FOUND when no completed Research exists and
     * QUALIFICATION_CONTEXT_NOT_FOUND when no Qualification version exists.
     */
    async assemble(leadId: string): Promise<LeadPainContext> {
        const lead = await db.leads.findUnique({
            where: { id: leadId }
        });

        if (!lead || !lead.company_id) {
            throw new Error('RESEARCH_CONTEXT_NOT_FOUND');
        }

        const company = await db.companies.findUnique({
            where: { id: lead.company_id }
        });

        if (!company) {
            throw new Error('RESEARCH_CONTEXT_NOT_FOUND');
        }

        const research = await this.loadResearchContext(leadId);
        const qualification = await this.loadQualificationContext(leadId);

        return {
            leadId,
            company: {
                name: company.name,
                industry: company.industry ?? null,
                website: company.website ?? null
            },
            research,
            qualification
        };
    }

    /**
     * Loads the current persisted Research version, its raw result summary and
     * its evidence rows exactly as stored (real evidence IDs, no substitutes).
     */
    private async loadResearchContext(
        leadId: string
    ): Promise<PainResearchContext> {
        // Identity chain: lead -> latest COMPLETED research_request ->
        // research_data -> research_version (persisted FK on research_data) ->
        // research -> research_evidence. No company-scoped or temporal
        // selection is used anywhere in this chain.
        let researchRequest = await db.research_requests.findFirst({
            where: { lead_id: leadId, status: 'COMPLETED' },
            orderBy: { created_at: 'desc' }
        });

        if (!researchRequest) {
            // Requests persisted before the status update existed may have
            // completed research without a COMPLETED status row; fall back to
            // the latest request and let the persisted FK identity below
            // decide. Missing FK link still yields RESEARCH_CONTEXT_NOT_FOUND.
            researchRequest = await db.research_requests.findFirst({
                where: { lead_id: leadId },
                orderBy: { created_at: 'desc' }
            });
        }

        if (!researchRequest) {
            throw new Error('RESEARCH_CONTEXT_NOT_FOUND');
        }

        const researchData = await db.research_data.findFirst({
            where: { request_id: researchRequest.id },
            orderBy: { created_at: 'desc' }
        });

        if (!researchData) {
            throw new Error('RESEARCH_CONTEXT_NOT_FOUND');
        }

        const versionResult = await db.query(
            `
            SELECT
                rv."id" AS research_version_id,
                rv."version_number",
                r."id" AS research_id
            FROM "research_data" rd
            INNER JOIN "research_versions" rv ON rv."id" = rd."research_version_id"
            INNER JOIN "research" r ON r."id" = rv."research_id"
            WHERE rd."id" = $1
              AND rd."research_version_id" IS NOT NULL
            LIMIT 1
            `,
            [researchData.id]
        );

        const versionRow = versionResult.rows[0];

        if (!versionRow) {
            throw new Error('RESEARCH_CONTEXT_NOT_FOUND');
        }

        const evidenceRows = await db.research_evidence.findMany({
            where: { research_id: versionRow.research_id },
            orderBy: { timestamp: 'asc' }
        });

        const rawData = (researchData.data ?? {}) as {
            result?: string;
        };

        return {
            researchId: versionRow.research_id,
            researchVersionId: versionRow.research_version_id,
            researchDataId: researchData.id,
            summary: rawData.result ?? '',
            evidence: evidenceRows.map((row: any) => ({
                evidenceId: row.id,
                text: row.evidence_text,
                sourceUrl: row.source_url ?? null,
                timestamp: row.timestamp
            }))
        };
    }

    /**
     * Loads the canonical Qualification result (latest version) and derives the
     * prompt summary/commercial signals via the existing context adapter.
     */
    private async loadQualificationContext(
        leadId: string
    ): Promise<PainQualificationContext> {
        const result = await qualificationVersionManager.getLatestResult(leadId);

        if (!result) {
            throw new Error('QUALIFICATION_CONTEXT_NOT_FOUND');
        }

        // Resolves the canonical qualifications.id row for the latest
        // version (same ordering as getLatestResult). This UUID is the FK
        // target used by pain_analyses.qualification_version_id and
        // manual_ai_tasks.qualification_version_id.
        const qualificationRow = await db.qualifications.findFirst({
            where: { lead_id: leadId },
            orderBy: { version: 'desc' }
        });

        if (!qualificationRow) {
            throw new Error('QUALIFICATION_CONTEXT_NOT_FOUND');
        }

        const adapted = qualificationContextAdapter.build(result);

        return {
            result,
            version: result.version,
            qualificationVersionId: qualificationRow.id,
            summary: adapted.summary,
            commercialSignals: adapted.commercialSignals
        };
    }
}

export const leadPainContextAssembler = new LeadPainContextAssembler();
