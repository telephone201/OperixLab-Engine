/**
 * @file proposal-public-response-service.ts
 * @description Client proposal responses (Sales MVP Milestone 2).
 *
 * Records a prospect's Accept / Request Changes decision for a signed
 * proposal link using the existing engagement, audit and notification
 * infrastructure. Proposal and proposal-version statuses are NEVER changed
 * here; the decision is represented only as engagement evidence.
 *
 * Idempotency: each (versionId, action) pair derives a stable correlation id
 * for engagementService.recordEvent, so repeated submissions return the
 * original event without duplicates.
 */

import { db } from '../../lib/db';
import { engagementService } from './engagement-service';
import { EngagementChannel, EngagementEventType } from './engagement-types';
import { auditLogger } from '../../core/logging/audit-logger';
import { notifications } from '../../core/notifications/notification-system';
import { proposalPublicViewService } from './proposal-public-view-service';
import { paymentService } from './payment-service';

export type ProposalResponseAction = 'ACCEPT' | 'REQUEST_CHANGES';

export interface ProposalResponseResult {
    status: 'ACCEPTED' | 'CHANGES_REQUESTED';
    duplicate: boolean;
}

const GENERIC_REJECTION = new Error('PROPOSAL_LINK_UNAVAILABLE');

const CORRELATION_PREFIX = 'public-proposal-response';

export class ProposalPublicResponseService {
    async recordResponse(params: {
        versionId: string;
        action: ProposalResponseAction;
        message?: string;
    }): Promise<ProposalResponseResult> {
        const trimmedMessage =
            params.action === 'REQUEST_CHANGES'
                ? (params.message ?? '').trim()
                : undefined;

        if (params.action === 'REQUEST_CHANGES' && (trimmedMessage ?? '').length === 0) {
            throw GENERIC_REJECTION;
        }

        // 1. Same public access contract as the GET surface (exists, approved,
        // current version, unexpired). Rejected otherwise.
        const view = await proposalPublicViewService.getPublicProposalView(params.versionId);

        // 2. Resolve the engagement identity (lead/company/contact) for the
        // event row. Engagement events require lead_id + proposal_id.
        const context = await this.resolveEngagementContext(params.versionId);

        if (!context) {
            throw GENERIC_REJECTION;
        }

        // 3. Record the engagement event. recordEvent is idempotent on
        // correlation_id, making repeated clicks safe without a new table.
        const correlationId = `${CORRELATION_PREFIX}:${params.versionId}:${params.action}`;

        // Duplicate detection (verified against recordEvent's actual
        // semantics): the FIRST call generates a fresh id and persists it;
        // any replay returns the existing row. So if an event with this
        // correlation already exists before this call, this call is a replay.
        // The response stays identical either way (ACCEPTED / CHANGES_REQUESTED)
        // and no duplicate rows are created; the flag only marks the replay.
        const storedEventIdBefore = await this.findEventId(correlationId);
        const duplicate = storedEventIdBefore !== null;

        const eventType =
            params.action === 'ACCEPT'
                ? EngagementEventType.PROPOSAL_ACCEPTED
                : EngagementEventType.CHANGES_REQUESTED;

        const event = await engagementService.recordEvent({
            leadId: context.leadId,
            proposalId: context.proposalId,
            proposalVersionId: params.versionId,
            companyId: context.companyId ?? undefined,
            contactId: context.contactId ?? undefined,
            eventType,
            channel: EngagementChannel.PROPOSAL_PORTAL,
            correlationId,
            metadata: {
                source: 'PUBLIC_PROPOSAL_LINK',
                ...(trimmedMessage ? { clientMessage: trimmedMessage } : {})
            }
        });

        // 4. Audit + operator notification. Safe to run again on a duplicate:
        // audit entries are append-only evidence; notifications are the
        // operator's cue that the prospect responded.
        await auditLogger.log({
            action: eventType,
            entityType: 'ProposalVersion',
            entityId: params.versionId,
            details: {
                proposalId: context.proposalId,
                duplicate,
                ...(trimmedMessage ? { clientMessage: trimmedMessage } : {})
            }
        });

        await notifications.notify(
            eventType,
            params.action === 'ACCEPT'
                ? `Client accepted proposal (${view.offerName})`
                : `Client requested changes to proposal (${view.offerName}): ${trimmedMessage ?? ''}`,
            'HIGH',
            context.proposalId
        );

        // 5. Milestone 3 Step 1: after a client accepts, ensure the accepted
        // commercial agreement carries exactly one SETUP_FEE payment
        // requirement (idempotent; amount from the approved offer's setup
        // fee). A no-agreement-yet state is a no-op; a missing/invalid setup
        // fee is surfaced as a hard error rather than silently ignored.
        if (params.action === 'ACCEPT') {
            await paymentService.ensureSetupFeeRequirementForProposal({
                proposalId: context.proposalId
            });
        }

        return {
            status: params.action === 'ACCEPT' ? 'ACCEPTED' : 'CHANGES_REQUESTED',
            duplicate
        };
    }

    private async findEventId(correlationId: string): Promise<string | null> {
        const rows = await db.query(
            `SELECT id FROM engagement_events WHERE correlation_id = $1 LIMIT 1`,
            [correlationId]
        );

        return rows.rows[0] ? String(rows.rows[0].id) : null;
    }

    private async isPreExistingEvent(correlationId: string, eventId: string): Promise<boolean> {
        const rows = await db.query(
            `SELECT id FROM engagement_events WHERE correlation_id = $1 LIMIT 2`,
            [correlationId]
        );

        return rows.rows.length === 1 && String(rows.rows[0].id) !== String(eventId);
        // A single row that equals the returned event means this call created
        // it; the idempotent path in recordEvent returns the existing row, so
        // any single-row result that is NOT the newly generated event id (or a
        // repeated count) indicates a duplicate submission.
    }

    private async resolveEngagementContext(
        versionId: string
    ): Promise<{ proposalId: string; leadId: string; companyId: string | null; contactId: string | null } | null> {
        const result = await db.query(
            `SELECT p.id AS proposal_id,
                    cp.lead_id,
                    cp.company_id,
                    cp.contact_id
             FROM proposal_versions pv
             JOIN proposals p ON p.id = pv.proposal_id
             JOIN commercial_packages cp ON cp.id = p.commercial_package_id
             WHERE pv.id = $1
             LIMIT 1`,
            [versionId]
        );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            proposalId: String(row.proposal_id),
            leadId: String(row.lead_id),
            companyId: row.company_id ? String(row.company_id) : null,
            contactId: row.contact_id ? String(row.contact_id) : null
        };
    }
}

export const proposalPublicResponseService = new ProposalPublicResponseService();
