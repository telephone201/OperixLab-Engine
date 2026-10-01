/**
 * @file chat-api.ts
 * @description API client for the Chat v1 instruction lifecycle.
 */

import type {
    ChatInstruction,
    ChatInstructionStatus,
    ChatPlan,
    ChatResult,
    ChatDiscoveryResult,
    CompanySummaryResult,
    AttentionRequiredResult,
    PipelineAnalysisResult
} from '@/types/chat';

export type {
    ChatInstruction,
    ChatInstructionStatus,
    ChatPlan,
    ChatResult,
    ChatDiscoveryResult,
    CompanySummaryResult,
    AttentionRequiredResult,
    PipelineAnalysisResult
};

import { apiClient } from './api-client';

export const chatApi = {
    async createInstruction(
        instruction: string
    ): Promise<ChatInstruction> {
        const response =
            await apiClient.post<ChatInstruction>(
                '/chat/instructions',
                { instruction }
            );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    },

    async listInstructions(): Promise<ChatInstruction[]> {
        const response =
            await apiClient.get<ChatInstruction[]>(
                '/chat/instructions'
            );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    },

    async getInstruction(
        id: string
    ): Promise<ChatInstruction> {
        const response =
            await apiClient.get<ChatInstruction>(
                `/chat/instructions/${id}`
            );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    },

    async confirmInstruction(
        id: string
    ): Promise<ChatInstruction> {
        const response =
            await apiClient.post<ChatInstruction>(
                `/chat/instructions/${id}/confirm`
            );

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.data;
    }
};
