import { chatInstructionService } from './chat-instruction-service';
import { discoveryProvider } from './discovery-provider';
import { chatLeadIntakeService } from './chat-lead-intake-service';
import { ownerIntelligenceService } from './owner-intelligence-service';

const OWNER_INTELLIGENCE_INTENTS = new Set([
    'COMPANY_SUMMARY',
    'ATTENTION_REQUIRED',
    'PIPELINE_ANALYSIS'
]);

export class ChatRunOrchestrator {
    async run(instructionId: string, userId: string): Promise<void> {
        try {
            const instruction =
                await chatInstructionService.getById(instructionId);

            if (!instruction) {
                throw new Error('Chat instruction not found');
            }

            if (instruction.user_id !== userId) {
                throw new Error('Chat instruction access denied');
            }

            if (instruction.status !== 'CONFIRMED') {
                throw new Error(
                    `Chat instruction cannot run from status ${instruction.status}`
                );
            }

            await chatInstructionService.transition(
                instructionId,
                'RUNNING'
            );

            if (OWNER_INTELLIGENCE_INTENTS.has(instruction.intent)) {
                const report =
                    await ownerIntelligenceService.generateReport(
                        instruction.intent
                    );

                await chatInstructionService.setResult(
                    instructionId,
                    report
                );

                await chatInstructionService.transition(
                    instructionId,
                    'COMPLETED',
                    {
                        reportType: instruction.intent,
                        generatedAt: report.generatedAt
                    }
                );

                return;
            }

            const discovery =
                await discoveryProvider.discover({
                    instruction: instruction.instruction_text,
                    searchTerms: Array.isArray(instruction.plan?.searchTerms)
                        ? instruction.plan.searchTerms
                        : undefined,
                    locationQuery:
                        typeof instruction.plan?.locationQuery === 'string'
                            ? instruction.plan.locationQuery
                            : null
                });

            if (discovery.leads.length === 0) {
                await chatInstructionService.setResult(
                    instructionId,
                    {
                        provider: discovery.provider,
                        discoveredLeadCount: 0,
                        leads: []
                    }
                );

                await chatInstructionService.transition(
                    instructionId,
                    'WAITING_REVIEW',
                    {
                        reason: 'NO_DISCOVERY_RESULTS'
                    }
                );

                return;
            }

            const intake =
                await chatLeadIntakeService.intake(
                    discovery.leads
                );

            await chatInstructionService.setResult(
                instructionId,
                {
                    provider: discovery.provider,
                    discoveredLeadCount: discovery.leads.length,
                    persistedLeadIds: intake.persistedLeadIds,
                    persistedCount: intake.persistedCount,
                    duplicateCount: intake.duplicateCount,
                    skippedCount: intake.skippedCount,
                    errorCount: intake.errorCount,
                    errors: intake.errors
                }
            );

            await chatInstructionService.transition(
                instructionId,
                'WAITING_REVIEW',
                {
                    reason: 'DISCOVERY_COMPLETED',
                    discoveredLeadCount:
                        discovery.leads.length,
                    persistedCount:
                        intake.persistedCount,
                    duplicateCount:
                        intake.duplicateCount,
                    skippedCount:
                        intake.skippedCount,
                    errorCount:
                        intake.errorCount
                }
            );
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Chat instruction execution failed';

            try {
                await chatInstructionService.setError(
                    instructionId,
                    message
                );

                const current =
                    await chatInstructionService.getById(
                        instructionId
                    );

                if (
                    current &&
                    ['CONFIRMED', 'RUNNING'].includes(
                        current.status
                    )
                ) {
                    await chatInstructionService.transition(
                        instructionId,
                        'FAILED',
                        { error: message }
                    );
                }
            } catch (persistenceError) {
                console.error(
                    '[CHAT] Failed to persist execution error:',
                    persistenceError
                );
            }
        }
    }
}

export const chatRunOrchestrator =
    new ChatRunOrchestrator();


