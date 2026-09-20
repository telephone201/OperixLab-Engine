/**
 * @file engagement-types.ts
 * @description Domain types for proposal engagement and client interaction tracking.
 */

export enum EngagementEventType {
    PROPOSAL_CREATED = 'PROPOSAL_CREATED',
    PROPOSAL_APPROVED = 'PROPOSAL_APPROVED',
    PROPOSAL_SENT = 'PROPOSAL_SENT',
    PROPOSAL_OPENED = 'PROPOSAL_OPENED',
    PROPOSAL_REOPENED = 'PROPOSAL_REOPENED',
    SECTION_VIEWED = 'SECTION_VIEWED',
    DEMO_VIEWED = 'DEMO_VIEWED',
    DEMO_CLICKED = 'DEMO_CLICKED',
    PRICING_VIEWED = 'PRICING_VIEWED',
    FAQ_VIEWED = 'FAQ_VIEWED',
    CTA_CLICKED = 'CTA_CLICKED',
    CONTACT_CLICKED = 'CONTACT_CLICKED',
    MEETING_CLICKED = 'MEETING_CLICKED',
    MEETING_REQUESTED = 'MEETING_REQUESTED',
    MEETING_BOOKED = 'MEETING_BOOKED',
    PROPOSAL_EXPIRED = 'PROPOSAL_EXPIRED',
    PROPOSAL_REJECTED = 'PROPOSAL_REJECTED',
    PROPOSAL_WITHDRAWN = 'PROPOSAL_WITHDRAWN'
}

export enum EngagementChannel {
    EMAIL = 'EMAIL',
    PROPOSAL_PORTAL = 'PROPOSAL_PORTAL',
    MANUAL = 'MANUAL',
    LINKEDIN = 'LINKEDIN',
    WHATSAPP = 'WHATSAPP',
    PHONE = 'PHONE',
    CALENDAR = 'CALENDAR',
    OTHER = 'OTHER'
}

export interface EngagementEvent {
    eventId: string;
    leadId: string;
    companyId?: string;
    contactId?: string;
    proposalId: string;
    proposalVersionId?: string;
    eventType: EngagementEventType;
    channel: EngagementChannel;
    timestamp: Date;
    metadata: Record<string, any>;
    correlationId?: string;
}

export interface EngagementMetrics {
    firstOpenAt?: Date;
    lastOpenAt?: Date;
    openCount: number;
    sectionViewCount: number;
    demoClickCount: number;
    pricingViewCount: number;
    ctaClickCount: number;
    meetingClickCount: number;
    meetingBooked: boolean;
    lastEngagementAt?: Date;
}

export enum ProposalEngagementState {
    NOT_SENT = 'NOT_SENT',
    SENT = 'SENT',
    OPENED = 'OPENED',
    ENGAGED = 'ENGAGED',
    HIGH_ENGAGEMENT = 'HIGH_ENGAGEMENT',
    EXPIRED = 'EXPIRED',
    REJECTED = 'REJECTED',
    WITHDRAWN = 'WITHDRAWN'
}
