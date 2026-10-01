/**
 * @file qualification-service.ts
 * @description Orchestrates evidence-based qualification scoring and persistence.
 */

import { db } from '../../lib/db';
import {
    ScoreComponentCalculator,
    DEFAULT_WEIGHTS
} from './score-component-calculator';
import { QualificationClassifier } from './qualification-classifier';
import { QualificationVersionManager } from './qualification-version-manager';
import { QualificationResult } from './qualification-types';

interface ResearchEvidenceRow {
    id: string;
    evidence_text: string;
    source_url: string | null;
    timestamp: Date;
}

interface QualificationEvidenceContext {
    industry: string | null;
    targetIndustry: string[];
    employeeCount: number | null;
    revenueTier: string | null;
    decisionMaker: {
        verified_status: 'VERIFIED' | 'IDENTIFIED';
        person_name: string;
    } | null;
    automationSignals: Array<{
        type: string;
        value: boolean;
        evidenceId?: string;
        text?: string;
    }>;
    evidenceCount: number;
    websiteQuality: 'HIGH' | 'UNKNOWN';
    researchEvidence: Array<{
        id: string;
        text: string;
        sourceUrl: string | null;
        timestamp: Date;
    }>;
}

export class QualificationService {
    private calculator = new ScoreComponentCalculator();
    private classifier = new QualificationClassifier();
    private versionManager = new QualificationVersionManager();

    async calculateAndSave(leadId: string): Promise<QualificationResult> {
        const context = await this.loadContext(leadId);

        const components = [
            this.calculator.calculate(
                'ICP Fit',
                context.evidence,
                DEFAULT_WEIGHTS.icpFit
            ),
            this.calculator.calculate(
                'Automation Opportunity',
                context.evidence,
                DEFAULT_WEIGHTS.automationOpportunity
            ),
            this.calculator.calculate(
                'Decision Maker',
                context.evidence,
                DEFAULT_WEIGHTS.decisionMaker
            ),
            this.calculator.calculate(
                'Commercial Potential',
                context.evidence,
                DEFAULT_WEIGHTS.commercialPotential
            ),
            this.calculator.calculate(
                'Data Confidence',
                context.evidence,
                DEFAULT_WEIGHTS.dataConfidence
            ),
            this.calculator.calculate(
                'Demo Potential',
                context.evidence,
                DEFAULT_WEIGHTS.demoPotential
            )
        ];

        const result = this.classifier.classify(leadId, components);

        await this.versionManager.saveResult(result);

        return result;
    }

    private async loadContext(
        leadId: string
    ): Promise<{ evidence: QualificationEvidenceContext }> {
        const leadResult = await db.query(
            `
            SELECT
                l.id AS lead_id,
                c.name AS company_name,
                c.industry,
                c.employee_count,
                c.revenue_tier,
                ct.first_name,
                ct.last_name,
                ct.role,
                ct.seniority,
                ct.is_primary_decision_maker
            FROM "leads" l
            LEFT JOIN "companies" c ON c.id = l.company_id
            LEFT JOIN "contacts" ct ON ct.id = l.contact_id
            WHERE l.id = $1
            `,
            [leadId]
        );

        const lead = leadResult.rows[0];

        if (!lead) {
            throw new Error('LEAD_NOT_FOUND');
        }

        /*
         * Research identity is lead-scoped:
         * lead -> latest research_request -> research_data -> research_version.
         * We intentionally do not use company-wide research selection here.
         */
        const researchDataResult = await db.query(
            `
            SELECT
                rd.id,
                rd.data,
                rd.research_version_id,
                rr.id AS research_request_id
            FROM "research_data" rd
            INNER JOIN "research_requests" rr
                ON rr.id = rd.request_id
            WHERE rr.lead_id = $1
            ORDER BY rd.created_at DESC
            LIMIT 1
            `,
            [leadId]
        );

        const researchData = researchDataResult.rows[0];

        let researchEvidenceRows: ResearchEvidenceRow[] = [];

        if (researchData?.research_version_id) {
            const researchEvidenceResult = await db.query(
                `
                SELECT
                    re.id,
                    re.evidence_text,
                    re.source_url,
                    re.timestamp
                FROM "research_evidence" re
                INNER JOIN "research_versions" rv
                    ON rv.research_id = re.research_id
                WHERE rv.id = $1
                ORDER BY re.timestamp ASC
                `,
                [researchData.research_version_id]
            );

            researchEvidenceRows = researchEvidenceResult.rows;
        }

        const researchResultText =
            typeof researchData?.data?.result === 'string'
                ? researchData.data.result
                : '';

        const evidence = this.buildEvidenceContext(
            lead,
            researchResultText,
            researchEvidenceRows
        );

        return { evidence };
    }

    private buildEvidenceContext(
        lead: any,
        researchResult: string,
        researchEvidenceRows: ResearchEvidenceRow[]
    ): QualificationEvidenceContext {
        const normalizedResearch = researchResult.toLowerCase();

        const researchEvidence = researchEvidenceRows.map(row => ({
            id: row.id,
            text: row.evidence_text,
            sourceUrl: row.source_url,
            timestamp: row.timestamp
        }));

        const automationSignals: QualificationEvidenceContext['automationSignals'] = [];

        const addVerifiedAutomationOpportunitySignal = (
            type: string,
            patterns: string[]
        ) => {
            const matchedEvidence = researchEvidenceRows.find(row => {
                const text = row.evidence_text.toLowerCase();

                return patterns.some(pattern => text.includes(pattern));
            });

            const verifiedInReport = patterns.some(pattern =>
                this.isVerifiedStatement(normalizedResearch, pattern)
            );

            if (matchedEvidence && verifiedInReport) {
                automationSignals.push({
                    type,
                    value: true,
                    evidenceId: matchedEvidence.id,
                    text: matchedEvidence.evidence_text
                });
            }
        };

        /*
         * Automation Opportunity must represent an evidence-backed
         * operational gap, not merely the existence of digital capabilities.
         *
         * Digital capabilities such as online booking, CRM, ERP,
         * practice-management software, chat widgets, or WhatsApp
         * availability are NOT positive automation opportunities by themselves.
         *
         * UNKNOWN or INFERRED statements must never become positive
         * automation signals.
         *
         * Only explicitly VERIFIED statements describing a manual process
         * or a verified absence of automation are eligible here.
         */
        addVerifiedAutomationOpportunitySignal(
            'MANUAL_APPOINTMENT_HANDLING',
            [
                'manual appointment handling',
                'appointments are handled manually',
                'appointment requests are handled manually',
                'appointment booking is handled manually'
            ]
        );

        addVerifiedAutomationOpportunitySignal(
            'MANUAL_LEAD_FOLLOW_UP',
            [
                'manual lead follow-up',
                'leads are followed up manually',
                'lead follow-up is handled manually',
                'customer follow-up is handled manually',
                'customer follow-up is manual'
            ]
        );

        addVerifiedAutomationOpportunitySignal(
            'MANUAL_DATA_ENTRY',
            [
                'manual data entry',
                'data is entered manually',
                'patient data is entered manually',
                'lead data is entered manually'
            ]
        );

        addVerifiedAutomationOpportunitySignal(
            'NO_AUTOMATED_REMINDERS',
            [
                'no automated reminders',
                'reminders are not automated',
                'appointment reminders are not automated',
                'appointment reminders are manual',
                'manual appointment reminders'
            ]
        );

        addVerifiedAutomationOpportunitySignal(
            'MANUAL_WHATSAPP_FOLLOW_UP',
            [
                'manual whatsapp follow-up',
                'whatsapp follow-up is handled manually',
                'whatsapp messages are handled manually'
            ]
        );

        addVerifiedAutomationOpportunitySignal(
            'MANUAL_FORM_PROCESSING',
            [
                'manual form processing',
                'forms are processed manually',
                'contact forms are processed manually',
                'form submissions are processed manually'
            ]
        );
        const decisionMaker =
            lead.is_primary_decision_maker
                ? {
                    verified_status: 'VERIFIED' as const,
                    person_name: [lead.first_name, lead.last_name]
                        .filter(Boolean)
                        .join(' ')
                }
                : lead.role
                    ? {
                        verified_status: 'IDENTIFIED' as const,
                        person_name: [lead.first_name, lead.last_name]
                            .filter(Boolean)
                            .join(' ')
                    }
                    : this.extractVerifiedDecisionMaker(researchResult);

        return {
            industry: lead.industry ?? null,
            targetIndustry: ['Automation'],
            employeeCount: lead.employee_count ?? null,
            revenueTier: lead.revenue_tier ?? null,
            decisionMaker,
            automationSignals,
            evidenceCount: researchEvidenceRows.length,
            websiteQuality:
                researchEvidenceRows.length > 0 ? 'HIGH' : 'UNKNOWN',
            researchEvidence
        };
    }

    private isVerifiedStatement(
        researchText: string,
        signalPattern: string
    ): boolean {
        const escaped = signalPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const verifiedPattern = new RegExp(
            `(?:verified|verified\\s*[—:-])[^\\n]{0,180}${escaped}`,
            'i'
        );

        return verifiedPattern.test(researchText);
    }

    private extractVerifiedDecisionMaker(
        researchResult: string
    ): QualificationEvidenceContext['decisionMaker'] {
        const sectionMatch = researchResult.match(
            /##\s*5\.\s*Decision Maker([\s\S]*?)(?=\n##\s*|\n###\s*|$)/i
        );

        if (!sectionMatch?.[1]) {
            return null;
        }

        const section = sectionMatch[1];

        if (/owner or founder:\s*unknown/i.test(section)) {
            return null;
        }

        const namedMatch = section.match(
            /(?:owner|founder|head of operations|clinical lead)\s*:\s*(?:verified\s*[—:-]\s*)?(.+)/i
        );

        if (!namedMatch?.[1]) {
            return null;
        }

        const personName = namedMatch[1]
            .replace(/\s*(?:verified|inferred)\s*[—:-].*$/i, '')
            .trim();

        if (
            !personName ||
            /^unknown$/i.test(personName) ||
            /^not available$/i.test(personName)
        ) {
            return null;
        }

        return {
            verified_status: 'VERIFIED',
            person_name: personName
        };
    }
}

export const qualificationService = new QualificationService();

