/**
 * @file chat-controller.ts
 * @description HTTP controller for Chat v1 instruction lifecycle.
 */

import { Request, Response } from 'express';
import { chatInstructionService } from '../services/chat/chat-instruction-service';
import { buildPlan } from '../services/chat/chat-plan-builder';
import { chatRunOrchestrator } from '../services/chat/chat-run-orchestrator';

function getAuthenticatedUserId(req: Request): string {
    const userId = req.user?.id;

    if (!userId) {
        throw new Error('Authentication required');
    }

    return userId;
}

export class ChatController {
    async createInstruction(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const userId = getAuthenticatedUserId(req);
            const instructionText =
                typeof req.body?.instruction === 'string'
                    ? req.body.instruction.trim()
                    : '';

            if (!instructionText) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Instruction is required'
                    }
                });
                return;
            }

            const { intent, plan } =
                buildPlan(instructionText);

            const OWNER_INTELLIGENCE_INTENTS = new Set([
                'COMPANY_SUMMARY',
                'ATTENTION_REQUIRED',
                'PIPELINE_ANALYSIS'
            ]);

            if (
                OWNER_INTELLIGENCE_INTENTS.has(intent) &&
                req.user?.role !== 'OWNER'
            ) {
                res.status(403).json({
                    error: {
                        code: 'FORBIDDEN',
                        message:
                            'Owner intelligence reports are restricted to the OWNER role'
                    }
                });
                return;
            }

            const instruction =
                await chatInstructionService.create({
                    userId,
                    instructionText,
                    intent,
                    plan
                });

            res.status(201).json({
                data: instruction
            });
        } catch (error: any) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to create chat instruction';

            if (
                message.startsWith('Unsupported instruction') ||
                message === 'Instruction is required'
            ) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message
                    }
                });
                return;
            }

            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to create chat instruction'
                }
            });
        }
    }

    async listInstructions(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const userId = getAuthenticatedUserId(req);

            const instructions =
                await chatInstructionService.listForUser(
                    userId
                );

            res.status(200).json({
                data: instructions
            });
        } catch (error) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
        }
    }

    async getInstruction(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const userId = getAuthenticatedUserId(req);
            const instructionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

            if (!instructionId) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Instruction id is required'
                    }
                });
                return;
            }

            const instruction =
                await chatInstructionService.getById(
                    instructionId
                );

            if (!instruction) {
                res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Chat instruction not found'
                    }
                });
                return;
            }

            if (instruction.user_id !== userId) {
                res.status(403).json({
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied'
                    }
                });
                return;
            }

            res.status(200).json({
                data: instruction
            });
        } catch (error) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Authentication required'
                }
            });
        }
    }

    async confirmInstruction(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const userId = getAuthenticatedUserId(req);
            const instructionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

            if (!instructionId) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Instruction id is required'
                    }
                });
                return;
            }

            const existing =
                await chatInstructionService.getById(instructionId);

            if (!existing) {
                res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message: 'Chat instruction not found'
                    }
                });
                return;
            }

            if (existing.user_id !== userId) {
                res.status(403).json({
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied'
                    }
                });
                return;
            }

            const OWNER_INTELLIGENCE_INTENTS = new Set([
                'COMPANY_SUMMARY',
                'ATTENTION_REQUIRED',
                'PIPELINE_ANALYSIS'
            ]);

            if (
                OWNER_INTELLIGENCE_INTENTS.has(existing.intent) &&
                req.user?.role !== 'OWNER'
            ) {
                res.status(403).json({
                    error: {
                        code: 'FORBIDDEN',
                        message:
                            'Owner intelligence reports are restricted to the OWNER role'
                    }
                });
                return;
            }

            const instruction =
                await chatInstructionService.confirm(
                    instructionId,
                    userId
                );

            void chatRunOrchestrator.run(
                instruction.id,
                userId
            );

            res.status(200).json({
                data: instruction
            });
        } catch (error: any) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to confirm chat instruction';

            if (message === 'Chat instruction not found') {
                res.status(404).json({
                    error: {
                        code: 'RESOURCE_NOT_FOUND',
                        message
                    }
                });
                return;
            }

            if (message === 'Chat instruction access denied') {
                res.status(403).json({
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Access denied'
                    }
                });
                return;
            }

            res.status(409).json({
                error: {
                    code: 'INVALID_STATE',
                    message
                }
            });
        }
    }
}

export const chatController = new ChatController();
