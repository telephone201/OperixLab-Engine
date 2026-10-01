/**
 * @file dashboard-summary-service.ts
 * @description Provides aggregated read-only metrics for the owner dashboard.
 */

import { db } from '../../lib/db';

export interface DashboardSummary {
    acquisition: {
        qualifiedLeads: number;
        highIntentLeads: number;
    };
    commercial: {
        commercialPackages: number;
        pricingRecommendations: number;
        proposals: number;
    };
    actionRequired: {
        pendingApprovals: number;
        pendingPaymentReviews: number;
        unreadNotifications: number;
    };
    delivery: {
        pendingProjects: number;
        readyToStartProjects: number;
        startedProjects: number;
    };
    governance: {
        totalApprovals: number;
    };
}

export class DashboardSummaryService {
    async getSummary(): Promise<DashboardSummary> {
        const result = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM leads WHERE status = 'QUALIFIED') AS qualified_leads,
                (SELECT COUNT(*) FROM leads WHERE intent_status = 'HIGH') AS high_intent_leads,
                (SELECT COUNT(*) FROM commercial_packages) AS commercial_packages,
                (SELECT COUNT(*) FROM pricing_recommendations) AS pricing_recommendations,
                (SELECT COUNT(*) FROM proposals) AS proposals,
                (SELECT COUNT(*)
                 FROM governance_approvals
                 WHERE status = 'PENDING'
                   AND (expires_at IS NULL OR expires_at > NOW())) AS pending_approvals,
                (SELECT COUNT(*)
                 FROM payments
                 WHERE status IN ('REQUIRED', 'PARTIAL')
                   AND (status = 'PARTIAL' OR submitted_amount IS NOT NULL)) AS pending_payment_reviews,
                (SELECT COUNT(*) FROM notifications WHERE is_read = false) AS unread_notifications,
                (SELECT COUNT(*) FROM projects WHERE status = 'PENDING') AS pending_projects,
                (SELECT COUNT(*) FROM projects WHERE status = 'READY_TO_START') AS ready_to_start_projects,
                (SELECT COUNT(*) FROM projects WHERE status = 'STARTED') AS started_projects,
                (SELECT COUNT(*) FROM governance_approvals) AS total_approvals
        `);

        const row = result.rows[0];

        return {
            acquisition: {
                qualifiedLeads: Number(row.qualified_leads),
                highIntentLeads: Number(row.high_intent_leads)
            },
            commercial: {
                commercialPackages: Number(row.commercial_packages),
                pricingRecommendations: Number(row.pricing_recommendations),
                proposals: Number(row.proposals)
            },
            actionRequired: {
                pendingApprovals: Number(row.pending_approvals),
                pendingPaymentReviews: Number(row.pending_payment_reviews),
                unreadNotifications: Number(row.unread_notifications)
            },
            delivery: {
                pendingProjects: Number(row.pending_projects),
                readyToStartProjects: Number(row.ready_to_start_projects),
                startedProjects: Number(row.started_projects)
            },
            governance: {
                totalApprovals: Number(row.total_approvals)
            }
        };
    }
}

export const dashboardSummaryService = new DashboardSummaryService();
