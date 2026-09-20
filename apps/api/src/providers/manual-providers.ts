/**
 * @file manual-providers.ts
 * @description Manual/Stub implementations for providers to support Zero Cost Mode.
 * These providers return deterministic "MANUAL ACTION REQUIRED" or local responses.
 */

import {
    ILLMProvider, LLMRequest, LLMResponse, ProviderResult,
    IResearchProvider, ResearchRequest, ResearchData,
    ILocalBusinessProvider, BusinessQuery, BusinessLead,
    IEmailProvider, EmailMessage,
    ICalendarProvider, MeetingRequest,
    IPaymentProvider, PaymentVerificationRequest, PaymentVerificationResult,
    IN8NProvider, N8NWorkflow, N8NExecution
} from './provider-interfaces';

export class ManualLLMProvider implements ILLMProvider {
    name = 'ManualLLM';
    async generate(request: LLMRequest): Promise<ProviderResult<LLMResponse>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: {
                text: `[MANUAL AI TASK] Prompt: ${request.prompt}. Please process this in Gemini Pro manually.`,
                tokensUsed: 0,
                model: 'manual-gemini-pro'
            }
        };
    }
}

export class ManualResearchProvider implements IResearchProvider {
    name = 'ManualResearch';
    async research(request: ResearchRequest): Promise<ProviderResult<ResearchData>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: {
                facts: [{ fact: 'Manual research required for this entity.', source: 'manual', confidence: 0.5 }],
                summary: 'Research pending manual input.',
                metadata: {}
            }
        };
    }
}

export class ManualLocalBusinessProvider implements ILocalBusinessProvider {
    name = 'ManualLocalBusiness';
    async findBusinesses(query: BusinessQuery): Promise<ProviderResult<BusinessLead[]>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: [
                { name: 'Sample Business 1', address: '123 Main St, Cairo', phone: '+20123456789', website: 'http://sample1.com' }
            ]
        };
    }
}

export class ManualEmailProvider implements IEmailProvider {
    name = 'ManualEmail';
    async sendEmail(message: EmailMessage): Promise<ProviderResult<{ messageId: string }>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: { messageId: `manual-email-${Date.now()}` }
        };
    }
    async getThread(threadId: string): Promise<ProviderResult<any>> {
        return { success: true, provider: this.name, latencyMs: 10, data: { threads: [] } };
    }
}

export class ManualCalendarProvider implements ICalendarProvider {
    name = 'ManualCalendar';
    async createMeeting(request: MeetingRequest): Promise<ProviderResult<{ eventId: string }>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: { eventId: `manual-cal-${Date.now()}` }
        };
    }
    async checkAvailability(start: Date, end: Date): Promise<ProviderResult<boolean>> {
        return { success: true, provider: this.name, latencyMs: 10, data: true };
    }
}

export class ManualPaymentProvider implements IPaymentProvider {
    name = 'ManualPayment';
    async verifyPayment(request: PaymentVerificationRequest): Promise<ProviderResult<PaymentVerificationResult>> {
        return {
            success: true,
            provider: this.name,
            latencyMs: 10,
            data: {
                verified: false, // Defaults to false, requires human verification
                transactionId: 'PENDING_HUMAN_REVIEW',
                verificationDate: new Date()
            }
        };
    }
}

export class ManualN8NProvider implements IN8NProvider {
    name = 'ManualN8N';
    async authenticate(): Promise<ProviderResult<boolean>> {
        return {
            success: false,
            provider: this.name,
            latencyMs: 10,
            error: 'MANUAL_SETUP_REQUIRED: N8N_BASE_URL and N8N_API_KEY are missing.'
        };
    }
    async getWorkflow(id: string): Promise<ProviderResult<N8NWorkflow>> {
        return { success: false, provider: this.name, latencyMs: 10, error: 'MANUAL_SETUP_REQUIRED' };
    }
    async deployWorkflow(workflow: N8NWorkflow): Promise<ProviderResult<{ workflowId: string }>> {
        return { success: false, provider: this.name, latencyMs: 10, error: 'MANUAL_SETUP_REQUIRED' };
    }
    async activateWorkflow(id: string): Promise<ProviderResult<boolean>> {
        return { success: false, provider: this.name, latencyMs: 10, error: 'MANUAL_SETUP_REQUIRED' };
    }
    async deactivateWorkflow(id: string): Promise<ProviderResult<boolean>> {
        return { success: false, provider: this.name, latencyMs: 10, error: 'MANUAL_SETUP_REQUIRED' };
    }
    async getExecutionStatus(executionId: string): Promise<ProviderResult<N8NExecution>> {
        return { success: false, provider: this.name, latencyMs: 10, error: 'MANUAL_SETUP_REQUIRED' };
    }
}
