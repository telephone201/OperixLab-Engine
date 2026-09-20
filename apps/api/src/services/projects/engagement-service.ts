/**
 * @file engagement-service.ts
 * @description Records proposal engagement events and updates engagement metrics.
 */

import { db } from '../../lib/db';
import {
    EngagementEvent,
    EngagementEventType,
    EngagementChannel,
    ProposalEngagementState,
    EngagementMetrics
} from './engagement-types';
import { auditLogger } from '../../core/logging/audit-logger';

export class EngagementService {
    /**
     * Records a client engagement event.
     * Implements idempotency based on correlationId and eventType.
     */
    async recordEvent(params: {
        leadId: string;
        proposalId: string;
        eventType: EngagementEventType;
        channel: EngagementChannel;
        proposalVersionId?: string;
        companyId?: string;
        contactId?: string;
        metadata?: any;
        correlationId?: string;
    }): Promise<EngagementEvent> {

        // 1. Idempotency Check
        if (params.correlationId) {
            const existing = await db.engagement_events.findFirst({
                where: { correlation_id: params.correlationId }
            });
            if (existing) return this.mapToDomain(existing);
        }

        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const event = await db.engagement_events.create({
            data: {
                id: eventId,
                lead_id: params.leadId,
                proposal_id: params.proposalId,
                event_type: params.eventType,
                channel: params.channel,
                proposal_version_id: params.proposalVersionId,
                company_id: params.companyId,
                contact_id: params.contactId,
                metadata: params.metadata,
                correlation_id: params.correlationId,
                timestamp: new Date()
            }
        });

        // 2. Update Engagement Metrics & State
        await this.updateEngagementState(params.proposalId, params.eventType);

        await auditLogger.log({
            action: 'ENGAGEMENT_EVENT_RECORDED',
            entityType: 'EngagementEvent',
            entityId: eventId,
            details: { eventType: params.eventType, proposalId: params.proposalId }
        });

        return this.mapToDomain(event);
    }

    /**
     * Updates the derived metrics and state for a proposal.
     */
    private async updateEngagementState(proposalId: string, eventType: EngagementEventType): Promise<void> {
        const state = await db.proposal_engagement_state.findUnique({ where: { proposal_id: proposalId } });

        const updateData: any = {
            last_engagement_at: new Date(),
            updated_at: new Date()
        };

        if (!state) {
            // Initialize state
            await db.proposal_engagement_state.create({
                data: {
                    proposal_id: proposalId,
                    status: this.deriveStatus(eventType),
                    ...updateData,
                    // Initialize metrics based on event
                    open_count: eventType === EngagementEventType.PROPOSAL_OPENED ? 1 : 0,
                    first_open_at: eventType === EngagementEventType.PROPOSAL_OPENED ? new Date() : null,
                    last_open_at: eventType === EngagementEventType.PROPOSAL_OPENED ? new Date() : null,
                }
            });
            return;
        }

        // Increment Metrics
        if (eventType === EngagementEventType.PROPOSAL_OPENED) {
            updateData.open_count = { increment: 1 };
            updateData.last_open_at = new Date();
            if (!state.first_open_at) updateData.first_open_at = new Date();
        } else if (eventType === EngagementEventType.SECTION_VIEWED) {
            updateData.section_view_count = { increment: 1 };
        } else if (eventType === EngagementEventType.DEMO_CLICKED) {
            updateData.demo_click_count = { increment: 1 };
        } else if (eventType === EngagementEventType.PRICING_VIEWED) {
            updateData.pricing_view_count = { increment: 1 };
        } else if (eventType === EngagementEventType.CTA_CLICKED) {
            updateData.cta_click_count = { increment: 1 };
        } else if (eventType === EngagementEventType.MEETING_CLICKED) {
            updateData.meeting_click_count = { increment: 1 };
        } else if (eventType === EngagementEventType.MEETING_BOOKED) {
            updateData.meeting_booked = true;
        }

        // Update Status
        const newStatus = this.deriveStatus(eventType, state.status);
        updateData.status = newStatus;

        await db.proposal_engagement_state.update({
            where: { proposal_id: proposalId },
            data: updateData
        });
    }

    private deriveStatus(eventType: EngagementEventType, currentStatus?: string): string {
        if (eventType === EngagementEventType.PROPOSAL_OPENED) return ProposalEngagementState.OPENED;
        if (eventType === EngagementEventType.MEETING_BOOKED) return ProposalEngagementState.HIGH_ENGAGEMENT;
        if (eventType === EngagementEventType.CTA_CLICKED || eventType === EngagementEventType.MEETING_CLICKED) {
            return ProposalEngagementState.ENGAGED;
        }
        return currentStatus || ProposalEngagementState.NOT_SENT;
    }

    private mapToDomain(event: any): EngagementEvent {
        return {
            eventId: event.id,
            leadId: event.lead_id,
            companyId: event.company_id,
            contactId: event.contact_id,
            proposalId: event.proposal_id,
            proposalVersionId: event.proposal_version_id,
            eventType: event.event_type as EngagementEventType,
            channel: event.channel as EngagementChannel,
            timestamp: event.timestamp,
            metadata: event.metadata,
            correlationId: event.correlation_id
        };
    }
}

export const engagementService = new EngagementService();

