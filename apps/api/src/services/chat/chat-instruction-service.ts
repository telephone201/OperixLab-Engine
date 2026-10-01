/**
 * @file chat-instruction-service.ts
 * @description Persistence and guarded lifecycle transitions for Chat v1 instructions.
 */

import { db } from '../../lib/db';
import { auditLogger } from '../../core/logging/audit-logger';

export type ChatInstructionStatus =
    | 'DRAFT'
    | 'CONFIRMED'
    | 'RUNNING'
    | 'WAITING_REVIEW'
    | 'COMPLETED'
    | 'FAILED';

export interface ChatInstruction {
    id: string;
    user_id: string;
    instruction_text: string;
    intent: string;
    plan: Record<string, any>;
    status: ChatInstructionStatus;
    result: Record<string, any> | null;
    error: string | null;
    confirmed_by: string | null;
    confirmed_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateChatInstructionInput {
    userId: string;
    instructionText: string;
    intent: string;
    plan: Record<string, any>;
}

const ALLOWED_TRANSITIONS: Record<
    ChatInstructionStatus,
    ChatInstructionStatus[]
> = {
    DRAFT: ['CONFIRMED', 'FAILED'],
    CONFIRMED: ['RUNNING', 'FAILED'],
    RUNNING: ['WAITING_REVIEW', 'COMPLETED', 'FAILED'],
    WAITING_REVIEW: ['COMPLETED', 'FAILED'],
    COMPLETED: [],
    FAILED: []
};

export class ChatInstructionService {
    async create(
        input: CreateChatInstructionInput
    ): Promise<ChatInstruction> {
        const row = await db.chat_instructions.create({
            data: {
                user_id: input.userId,
                instruction_text: input.instructionText,
                intent: input.intent,
                plan: input.plan,
                status: 'DRAFT',
                result: null,
                error: null,
                confirmed_by: null,
                confirmed_at: null,
                completed_at: null
            }
        });

        await auditLogger.log({
            userId: input.userId,
            action: 'CHAT_INSTRUCTION_CREATED',
            entityType: 'ChatInstruction',
            entityId: row.id,
            details: {
                intent: input.intent
            }
        });

        return row as ChatInstruction;
    }

    async getById(id: string): Promise<ChatInstruction | null> {
        const row = await db.chat_instructions.findUnique({
            where: { id }
        });

        return row as ChatInstruction | null;
    }

    async listForUser(
        userId: string,
        limit = 50
    ): Promise<ChatInstruction[]> {
        const rows = await db.chat_instructions.findMany({
            where: { user_id: userId },
            orderBy: {
                created_at: 'desc'
            },
            take: Math.min(Math.max(limit, 1), 100)
        });

        return rows as ChatInstruction[];
    }

    async confirm(
        id: string,
        userId: string
    ): Promise<ChatInstruction> {
        const row = await db.chat_instructions.findUnique({
            where: { id }
        });

        if (!row) {
            throw new Error('Chat instruction not found');
        }

        if (row.user_id !== userId) {
            throw new Error('Chat instruction access denied');
        }

        if (row.status !== 'DRAFT') {
            throw new Error(
                `Chat instruction cannot be confirmed from status ${row.status}`
            );
        }

        const updated = await db.chat_instructions.update({
            where: {
                id,
                status: 'DRAFT'
            },
            data: {
                status: 'CONFIRMED',
                confirmed_by: userId,
                confirmed_at: new Date()
            }
        });

        if (!updated) {
            throw new Error(
                'Chat instruction could not be confirmed because its state changed'
            );
        }

        await auditLogger.log({
            userId,
            action: 'CHAT_INSTRUCTION_CONFIRMED',
            entityType: 'ChatInstruction',
            entityId: id,
            details: {}
        });

        return updated as ChatInstruction;
    }

    async transition(
        id: string,
        toStatus: ChatInstructionStatus,
        details: Record<string, any> = {}
    ): Promise<ChatInstruction> {
        const row = await db.chat_instructions.findUnique({
            where: { id }
        });

        if (!row) {
            throw new Error('Chat instruction not found');
        }

        const currentStatus = row.status as ChatInstructionStatus;
        const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

        if (!allowed.includes(toStatus)) {
            throw new Error(
                `Invalid chat instruction transition: ${currentStatus} -> ${toStatus}`
            );
        }

        const data: Record<string, any> = {
            status: toStatus
        };

        if (toStatus === 'COMPLETED' || toStatus === 'FAILED') {
            data.completed_at = new Date();
        }

        const updated = await db.chat_instructions.update({
            where: {
                id,
                status: currentStatus
            },
            data
        });

        if (!updated) {
            throw new Error(
                'Chat instruction transition failed because its state changed'
            );
        }

        await auditLogger.log({
            action: `CHAT_INSTRUCTION_${toStatus}`,
            entityType: 'ChatInstruction',
            entityId: id,
            details: {
                fromStatus: currentStatus,
                toStatus,
                ...details
            }
        });

        return updated as ChatInstruction;
    }

    async setResult(
        id: string,
        result: Record<string, any>
    ): Promise<ChatInstruction> {
        const updated = await db.chat_instructions.update({
            where: { id },
            data: {
                result
            }
        });

        if (!updated) {
            throw new Error('Chat instruction not found');
        }

        return updated as ChatInstruction;
    }

    async setError(
        id: string,
        error: string
    ): Promise<ChatInstruction> {
        const updated = await db.chat_instructions.update({
            where: { id },
            data: {
                error
            }
        });

        if (!updated) {
            throw new Error('Chat instruction not found');
        }

        return updated as ChatInstruction;
    }
}

export const chatInstructionService = new ChatInstructionService();
