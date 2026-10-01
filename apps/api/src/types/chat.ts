/**
 * @file chat.ts
 * @description Frontend types for the Chat v1 control surface.
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
}

export interface ChatInstruction {
    id: string;
    user_id: string;
    instruction_text: string;
    intent: string;
    plan: ChatPlan;
    status: ChatInstructionStatus;
    result: Record<string, unknown> | null;
    error: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}
