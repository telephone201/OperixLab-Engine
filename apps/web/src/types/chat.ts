/**
 * @file chat.ts
 * @description Frontend types for the Chat v1 control surface and Owner Intelligence.
 */

export type ChatInstructionStatus =
    | 'DRAFT'
    | 'CONFIRMED'
    | 'RUNNING'
    | 'WAITING_REVIEW'
    | 'COMPLETED'
    | 'FAILED';

export interface ChatPlan {
    intent: string;
    summary: string;
    steps: string[];
    requiresConfirmation: boolean;
    searchTerms?: string[];
    locationQuery?: string | null;
}

export interface ChatDiscoveryResult {
    type?: string;
    provider?: string;
    discoveredLeadCount?: number;
    persistedCount?: number;
    duplicateCount?: number;
    skippedCount?: number;
    errorCount?: number;
    errors?: string[];
    persistedLeadIds?: string[];
}

export interface CompanySummaryResult {
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

export interface AttentionRequiredResult {
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

export interface PipelineAnalysisResult {
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

export type ChatResult =
    | ChatDiscoveryResult
    | CompanySummaryResult
    | AttentionRequiredResult
    | PipelineAnalysisResult
    | (Record<string, any> & { type?: string });

export interface ChatInstruction {
    id: string;
    user_id: string;
    instruction_text: string;
    intent: string;
    plan: ChatPlan;
    status: ChatInstructionStatus;
    result: ChatResult | null;
    error: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}
