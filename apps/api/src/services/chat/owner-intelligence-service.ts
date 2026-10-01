/**
 * @file owner-intelligence-service.ts
 * @description Service layer for aggregating and synthesizing real-time operational
 * intelligence from the database for the Operix Labs founder/owner.
 */

import { db } from '../../lib/db';

export interface CompanySummaryReport {
    type: 'COMPANY_SUMMARY';
    generatedAt: string;
    executiveNarrative: string;
    acquisition: {
        totalLeads: number;
        newLeads: number;
        qualifiedLeads: number;
        highIntentLeads: number;
        researchedLeads: number;
    };
    commercial: {
        packagesCount: number;
        pendingPricingReviews: number;
        proposalsCount: number;
        acceptedAgreements: number;
    };
    delivery: {
        readyToStart: number;
        inProgress: number;
        blocked: number;
        completed: number;
    };
    attention: {
        pendingApprovals: number;
        pendingPaymentReviews: number;
        unreadNotifications: number;
    };
    recentNotifications: Array<{
        id: string;
        title: string;
        message?: string;
        created_at: string;
    }>;
}

export interface AttentionRequiredReport {
    type: 'ATTENTION_REQUIRED';
    generatedAt: string;
    totalItemsRequiringAttention: number;
    summary: string;
    pendingApprovals: Array<{
        id: string;
        entityType: string;
        approvalType: string;
        requestedAt: string;
        reason?: string | null;
    }>;
    pendingPricingReviews: Array<{
        id: string;
        packageId?: string;
        recommendedPrice: number;
        currency: string;
        status: string;
    }>;
    pendingPaymentReviews: Array<{
        id: string;
        agreementId: string;
        expectedAmount: number;
        submittedAmount: number | null;
        currency: string;
        status: string;
    }>;
    actionableProjects: Array<{
        id: string;
        name: string;
        status: string;
        created_at: string;
    }>;
    criticalNotifications: Array<{
        id: string;
        title: string;
        created_at: string;
    }>;
}

export interface PipelineAnalysisReport {
    type: 'PIPELINE_ANALYSIS';
    generatedAt: string;
    summary: string;
    stages: {
        acquisition: {
            totalLeads: number;
            qualificationRatePct: number;
            highIntentRatioPct: number;
            statusBreakdown: Record<string, number>;
        };
        commercial: {
            commercialPackages: number;
            proposalsCount: number;
            acceptedAgreements: number;
            proposalConversionRatePct: number;
        };
        delivery: {
            readyToStart: number;
            activeProjects: number;
            completedProjects: number;
        };
    };
    bottlenecks: Array<{
        stage: 'Acquisition' | 'Commercial' | 'Payments' | 'Delivery';
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        description: string;
    }>;
    suggestedFocusAreas: string[];
}

export class OwnerIntelligenceService {
    /**
     * Aggregates a comprehensive cross-domain status summary of Operix Labs.
     */
    async getCompanySummary(): Promise<CompanySummaryReport> {
        // Query overall counts across core operational tables
        const countsQuery = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM leads) AS total_leads,
                (SELECT COUNT(*)::int FROM leads WHERE status = 'NEW') AS new_leads,
                (SELECT COUNT(*)::int FROM leads WHERE status = 'QUALIFIED') AS qualified_leads,
                (SELECT COUNT(*)::int FROM leads WHERE intent_status = 'HIGH' OR intent_status = 'READY_TO_BUY') AS high_intent_leads,
                (SELECT COUNT(*)::int FROM leads WHERE status = 'RESEARCHED') AS researched_leads,
                (SELECT COUNT(*)::int FROM commercial_packages) AS packages_count,
                (SELECT COUNT(*)::int FROM pricing_recommendations WHERE status IN ('DRAFT', 'GENERATED', 'PENDING')) AS pending_pricing_reviews,
                (SELECT COUNT(*)::int FROM proposals) AS proposals_count,
                (SELECT COUNT(*)::int FROM commercial_agreements WHERE status = 'ACCEPTED') AS accepted_agreements,
                (SELECT COUNT(*)::int FROM projects WHERE status = 'READY_TO_START') AS ready_to_start,
                (SELECT COUNT(*)::int FROM projects WHERE status IN ('STARTED', 'IN_PROGRESS')) AS in_progress,
                (SELECT COUNT(*)::int FROM projects WHERE status = 'BLOCKED') AS blocked_projects,
                (SELECT COUNT(*)::int FROM projects WHERE status IN ('COMPLETED', 'DELIVERED')) AS completed_projects,
                (SELECT COUNT(*)::int FROM governance_approvals WHERE status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())) AS pending_approvals,
                (SELECT COUNT(*)::int FROM payments WHERE status IN ('REQUIRED', 'PARTIAL') AND (status = 'PARTIAL' OR submitted_amount IS NOT NULL)) AS pending_payment_reviews,
                (SELECT COUNT(*)::int FROM notifications WHERE is_read = false) AS unread_notifications
        `);

        const row = countsQuery.rows[0];

        // Fetch recent unread notifications
        const notifQuery = await db.query(`
            SELECT id, message, type, created_at
            FROM notifications
            WHERE is_read = false
            ORDER BY created_at DESC
            LIMIT 4
        `);

        const totalLeads = Number(row.total_leads || 0);
        const qualifiedLeads = Number(row.qualified_leads || 0);
        const highIntentLeads = Number(row.high_intent_leads || 0);
        const pendingApprovals = Number(row.pending_approvals || 0);
        const pendingPaymentReviews = Number(row.pending_payment_reviews || 0);
        const readyToStart = Number(row.ready_to_start || 0);
        const inProgress = Number(row.in_progress || 0);

        let narrative = `Operix Labs has ${totalLeads} total leads recorded in the acquisition pipeline, with ${qualifiedLeads} qualified (${highIntentLeads} high-intent).`;
        if (pendingApprovals > 0 || pendingPaymentReviews > 0) {
            narrative += ` Immediate action is required: ${pendingApprovals} pending approval(s) and ${pendingPaymentReviews} payment verification(s) awaiting review.`;
        } else {
            narrative += ` Delivery is active with ${inProgress} project(s) underway and ${readyToStart} ready to launch.`;
        }

        return {
            type: 'COMPANY_SUMMARY',
            generatedAt: new Date().toISOString(),
            executiveNarrative: narrative,
            acquisition: {
                totalLeads,
                newLeads: Number(row.new_leads || 0),
                qualifiedLeads,
                highIntentLeads,
                researchedLeads: Number(row.researched_leads || 0),
            },
            commercial: {
                packagesCount: Number(row.packages_count || 0),
                pendingPricingReviews: Number(row.pending_pricing_reviews || 0),
                proposalsCount: Number(row.proposals_count || 0),
                acceptedAgreements: Number(row.accepted_agreements || 0),
            },
            delivery: {
                readyToStart,
                inProgress,
                blocked: Number(row.blocked_projects || 0),
                completed: Number(row.completed_projects || 0),
            },
            attention: {
                pendingApprovals,
                pendingPaymentReviews,
                unreadNotifications: Number(row.unread_notifications || 0),
            },
            recentNotifications: notifQuery.rows.map((n: any) => ({
                id: n.id,
                title: n.message || n.type || 'Notification',
                message: n.message,
                created_at: new Date(n.created_at).toISOString(),
            })),
        };
    }

    /**
     * Identifies pending operational decisions, approvals, payment reviews, and blockers.
     */
    async getAttentionRequired(): Promise<AttentionRequiredReport> {
        // 1. Pending approvals
        const approvalsQuery = await db.query(`
            SELECT id, entity_type, approval_type, requested_at, reason
            FROM governance_approvals
            WHERE status = 'PENDING'
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY requested_at ASC
            LIMIT 10
        `);

        // 2. Pending pricing reviews
        const pricingQuery = await db.query(`
            SELECT id, commercial_package_id, recommended_price, currency, status
            FROM pricing_recommendations
            WHERE status IN ('DRAFT', 'GENERATED', 'PENDING')
            ORDER BY created_at DESC
            LIMIT 10
        `);

        // 3. Pending payment verifications
        const paymentsQuery = await db.query(`
            SELECT id, agreement_id, expected_amount, submitted_amount, currency, status
            FROM payments
            WHERE status IN ('REQUIRED', 'PARTIAL')
              AND (status = 'PARTIAL' OR submitted_amount IS NOT NULL)
            ORDER BY created_at ASC
            LIMIT 10
        `);

        // 4. Actionable projects (Ready to start or Blocked)
        const projectsQuery = await db.query(`
            SELECT id, name, status, created_at
            FROM projects
            WHERE status IN ('READY_TO_START', 'BLOCKED')
            ORDER BY created_at ASC
            LIMIT 10
        `);

        // 5. Critical notifications
        const notifQuery = await db.query(`
            SELECT id, message, type, created_at
            FROM notifications
            WHERE is_read = false
            ORDER BY created_at DESC
            LIMIT 5
        `);

        const pendingApprovals = approvalsQuery.rows.map((r: any) => ({
            id: r.id,
            entityType: r.entity_type,
            approvalType: r.approval_type,
            requestedAt: new Date(r.requested_at).toISOString(),
            reason: r.reason,
        }));

        const pendingPricingReviews = pricingQuery.rows.map((r: any) => ({
            id: r.id,
            packageId: r.commercial_package_id,
            recommendedPrice: Number(r.recommended_price || 0),
            currency: r.currency || 'USD',
            status: r.status,
        }));

        const pendingPaymentReviews = paymentsQuery.rows.map((r: any) => ({
            id: r.id,
            agreementId: r.agreement_id,
            expectedAmount: Number(r.expected_amount || 0),
            submittedAmount: r.submitted_amount !== null ? Number(r.submitted_amount) : null,
            currency: r.currency || 'USD',
            status: r.status,
        }));

        const actionableProjects = projectsQuery.rows.map((r: any) => ({
            id: r.id,
            name: r.name || 'Unnamed Project',
            status: r.status,
            created_at: new Date(r.created_at).toISOString(),
        }));

        const criticalNotifications = notifQuery.rows.map((r: any) => ({
            id: r.id,
            title: r.message || r.type || 'Notification',
            created_at: new Date(r.created_at).toISOString(),
        }));

        const totalItems =
            pendingApprovals.length +
            pendingPricingReviews.length +
            pendingPaymentReviews.length +
            actionableProjects.length;

        let summary = `You have ${totalItems} operational item(s) requiring attention: `;
        const breakdownParts: string[] = [];
        if (pendingApprovals.length > 0) breakdownParts.push(`${pendingApprovals.length} governance approval(s)`);
        if (pendingPricingReviews.length > 0) breakdownParts.push(`${pendingPricingReviews.length} pricing review(s)`);
        if (pendingPaymentReviews.length > 0) breakdownParts.push(`${pendingPaymentReviews.length} payment verification(s)`);
        if (actionableProjects.length > 0) breakdownParts.push(`${actionableProjects.length} project(s) ready to start or blocked`);

        summary += breakdownParts.length > 0 ? breakdownParts.join(', ') + '.' : 'All clear. No urgent blockers.';

        return {
            type: 'ATTENTION_REQUIRED',
            generatedAt: new Date().toISOString(),
            totalItemsRequiringAttention: totalItems,
            summary,
            pendingApprovals,
            pendingPricingReviews,
            pendingPaymentReviews,
            actionableProjects,
            criticalNotifications,
        };
    }

    /**
     * Performs end-to-end pipeline analysis across acquisition, commercial, and delivery stages.
     */
    async getPipelineAnalysis(): Promise<PipelineAnalysisReport> {
        // Leads breakdown
        const leadsRes = await db.query(`
            SELECT status, COUNT(*)::int AS count
            FROM leads
            GROUP BY status
        `);

        const statusBreakdown: Record<string, number> = {};
        let totalLeads = 0;
        let qualifiedLeads = 0;

        for (const row of leadsRes.rows) {
            const count = Number(row.count);
            statusBreakdown[row.status] = count;
            totalLeads += count;
            if (row.status === 'QUALIFIED') {
                qualifiedLeads += count;
            }
        }

        const highIntentRes = await db.query(`
            SELECT COUNT(*)::int AS count
            FROM leads
            WHERE intent_status IN ('HIGH', 'READY_TO_BUY')
        `);
        const highIntentCount = Number(highIntentRes.rows[0]?.count || 0);

        // Commercial metrics
        const commRes = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM commercial_packages) AS packages,
                (SELECT COUNT(*)::int FROM proposals) AS proposals,
                (SELECT COUNT(*)::int FROM commercial_agreements WHERE status = 'ACCEPTED') AS agreements
        `);
        const packages = Number(commRes.rows[0]?.packages || 0);
        const proposals = Number(commRes.rows[0]?.proposals || 0);
        const agreements = Number(commRes.rows[0]?.agreements || 0);

        // Delivery metrics
        const delivRes = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM projects WHERE status = 'READY_TO_START') AS ready_to_start,
                (SELECT COUNT(*)::int FROM projects WHERE status IN ('STARTED', 'IN_PROGRESS')) AS active_projects,
                (SELECT COUNT(*)::int FROM projects WHERE status IN ('COMPLETED', 'DELIVERED')) AS completed_projects,
                (SELECT COUNT(*)::int FROM projects WHERE status = 'BLOCKED') AS blocked_projects,
                (SELECT COUNT(*)::int FROM payments WHERE status IN ('REQUIRED', 'PARTIAL') AND submitted_amount IS NOT NULL) AS pending_payments,
                (SELECT COUNT(*)::int FROM pricing_recommendations WHERE status IN ('DRAFT', 'GENERATED', 'PENDING')) AS pending_pricing
        `);
        const readyToStart = Number(delivRes.rows[0]?.ready_to_start || 0);
        const activeProjects = Number(delivRes.rows[0]?.active_projects || 0);
        const completedProjects = Number(delivRes.rows[0]?.completed_projects || 0);
        const blockedProjects = Number(delivRes.rows[0]?.blocked_projects || 0);
        const pendingPayments = Number(delivRes.rows[0]?.pending_payments || 0);
        const pendingPricing = Number(delivRes.rows[0]?.pending_pricing || 0);

        const qualRate = totalLeads > 0 ? Number(((qualifiedLeads / totalLeads) * 100).toFixed(1)) : 0;
        const highIntentRatio = qualifiedLeads > 0 ? Number(((highIntentCount / qualifiedLeads) * 100).toFixed(1)) : 0;
        const proposalConvRate = proposals > 0 ? Number(((agreements / proposals) * 100).toFixed(1)) : 0;

        // Identify bottlenecks dynamically
        const bottlenecks: PipelineAnalysisReport['bottlenecks'] = [];
        const focusAreas: string[] = [];

        if (pendingPayments > 0) {
            bottlenecks.push({
                stage: 'Payments',
                severity: 'HIGH',
                description: `${pendingPayments} submitted client payment(s) require verification to unlock project kickoff.`,
            });
            focusAreas.push('Verify pending client payments in Commercial Verification workspace.');
        }

        if (pendingPricing > 0) {
            bottlenecks.push({
                stage: 'Commercial',
                severity: 'MEDIUM',
                description: `${pendingPricing} pricing recommendation(s) are awaiting approval before proposals can be sent.`,
            });
            focusAreas.push('Review pricing recommendations in the Commercial workspace.');
        }

        if (blockedProjects > 0) {
            bottlenecks.push({
                stage: 'Delivery',
                severity: 'HIGH',
                description: `${blockedProjects} project(s) are currently marked as BLOCKED in delivery.`,
            });
            focusAreas.push('Inspect blocked delivery tasks to resolve impediments.');
        }

        const newLeads = statusBreakdown['NEW'] || 0;
        if (newLeads > 5) {
            bottlenecks.push({
                stage: 'Acquisition',
                severity: 'LOW',
                description: `${newLeads} new leads have not yet completed research enrichment.`,
            });
            focusAreas.push('Run research enrichment on incoming prospective leads.');
        }

        if (readyToStart > 0) {
            focusAreas.push(`Launch kickoff for ${readyToStart} project(s) ready to start.`);
        }

        if (focusAreas.length === 0) {
            focusAreas.push('Pipeline throughput is balanced. Focus on finding new leads that need automation.');
        }

        const summary = `Overall pipeline throughput shows ${qualifiedLeads} qualified leads with ${proposals} proposal(s) and ${agreements} accepted agreement(s). ${
            bottlenecks.length > 0 ? `${bottlenecks.length} operational bottleneck(s) identified.` : 'No critical friction points detected.'
        }`;

        return {
            type: 'PIPELINE_ANALYSIS',
            generatedAt: new Date().toISOString(),
            summary,
            stages: {
                acquisition: {
                    totalLeads,
                    qualificationRatePct: qualRate,
                    highIntentRatioPct: highIntentRatio,
                    statusBreakdown,
                },
                commercial: {
                    commercialPackages: packages,
                    proposalsCount: proposals,
                    acceptedAgreements: agreements,
                    proposalConversionRatePct: proposalConvRate,
                },
                delivery: {
                    readyToStart,
                    activeProjects,
                    completedProjects,
                },
            },
            bottlenecks,
            suggestedFocusAreas: focusAreas,
        };
    }

    /**
     * Generic report generator dispatching to the target intelligence method.
     */
    async generateReport(intent: string): Promise<Record<string, any>> {
        switch (intent) {
            case 'COMPANY_SUMMARY':
                return this.getCompanySummary();
            case 'ATTENTION_REQUIRED':
                return this.getAttentionRequired();
            case 'PIPELINE_ANALYSIS':
                return this.getPipelineAnalysis();
            default:
                throw new Error(`Unsupported intelligence intent: ${intent}`);
        }
    }
}

export const ownerIntelligenceService = new OwnerIntelligenceService();
