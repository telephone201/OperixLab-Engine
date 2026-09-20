/**
 * @file types.ts
 * @description Core types for Project and Delivery Operations.
 */

export enum ProjectStatus {
    PENDING = 'PENDING',
    STARTED = 'STARTED',
    IMPLEMENTING = 'IMPLEMENTING',
    REVIEW = 'REVIEW',
    ACCEPTED = 'ACCEPTED',
    HANDED_OVER = 'HANDED_OVER',
    COMPLETED = 'COMPLETED',
    ARCHIVED = 'ARCHIVED',
    BLOCKED = 'BLOCKED'
}

export enum PaymentStatus {
    REQUIRED = 'REQUIRED',
    PARTIAL = 'PARTIAL',
    VERIFIED = 'VERIFIED'
}

export interface Project {
    id: string;
    contractId: string;
    name: string;
    status: ProjectStatus;
    paymentStatus: PaymentStatus;
    paymentVerifiedAt?: Date;
    startDate?: Date;
    endDate?: Date;
    createdAt: Date;
}

export interface ProjectStateTransition {
    projectId: string;
    fromState: ProjectStatus;
    toState: ProjectStatus;
    actorId: string;
    reason: string;
    metadata?: any;
}
