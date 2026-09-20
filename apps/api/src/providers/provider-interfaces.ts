/**
 * @file provider-interfaces.ts
 * @description Core provider interfaces for the Operix Labs system.
 * These interfaces ensure the business logic is decoupled from specific third-party implementations.
 */

export interface ProviderResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    provider: string;
    latencyMs: number;
    cost?: number;
}

// --- AI / LLM Provider ---
export interface LLMRequest {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export interface LLMResponse {
    text: string;
    tokensUsed: number;
    model: string;
}

export interface ILLMProvider {
    name: string;
    generate(request: LLMRequest): Promise<ProviderResult<LLMResponse>>;
}

// --- Research Provider ---
export interface ResearchRequest {
    query: string;
    entityId?: string;
    depth: 'basic' | 'thorough' | 'exhaustive';
}

export interface ResearchData {
    facts: Array<{ fact: string; source: string; confidence: number }>;
    summary: string;
    metadata: Record<string, any>;
}

export interface IResearchProvider {
    name: string;
    research(request: ResearchRequest): Promise<ProviderResult<ResearchData>>;
}

// --- Local Business Provider ---
export interface BusinessQuery {
    searchTerm: string;
    location: string;
    category?: string;
}

export interface BusinessLead {
    name: string;
    address: string;
    phone: string;
    website?: string;
    rating?: number;
    reviewsCount?: number;
    coordinates?: { lat: number; lng: number };
}

export interface ILocalBusinessProvider {
    name: string;
    findBusinesses(query: BusinessQuery): Promise<ProviderResult<BusinessLead[]>>;
}

// --- Email Provider ---
export interface EmailMessage {
    to: string;
    subject: string;
    body: string;
    attachments?: Array<{ filename: string; content: string }>;
}

export interface IEmailProvider {
    name: string;
    sendEmail(message: EmailMessage): Promise<ProviderResult<{ messageId: string }>>;
    getThread(threadId: string): Promise<ProviderResult<any>>;
}

// --- Calendar Provider ---
export interface MeetingRequest {
    title: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
    description?: string;
}

export interface ICalendarProvider {
    name: string;
    createMeeting(request: MeetingRequest): Promise<ProviderResult<{ eventId: string }>>;
    checkAvailability(start: Date, end: Date): Promise<ProviderResult<boolean>>;
}

// --- Payment Provider ---
export interface PaymentVerificationRequest {
    amount: number;
    reference: string;
    proofUrl?: string;
}

export interface PaymentVerificationResult {
    verified: boolean;
    transactionId: string;
    verificationDate: Date;
}

export interface IPaymentProvider {
    name: string;
    verifyPayment(request: PaymentVerificationRequest): Promise<ProviderResult<PaymentVerificationResult>>;
}

// --- n8n Provider ---
export interface N8NWorkflow {
    id: string;
    name: string;
    nodes: any[];
    connections: any[];
    active: boolean;
}

export interface N8NExecution {
    executionId: string;
    status: 'success' | 'failed' | 'running';
    startTime: Date;
    endTime?: Date;
    error?: string;
}

export interface IN8NProvider {
    name: string;
    authenticate(): Promise<ProviderResult<boolean>>;
    getWorkflow(id: string): Promise<ProviderResult<N8NWorkflow>>;
    deployWorkflow(workflow: N8NWorkflow): Promise<ProviderResult<{ workflowId: string }>>;
    activateWorkflow(id: string): Promise<ProviderResult<boolean>>;
    deactivateWorkflow(id: string): Promise<ProviderResult<boolean>>;
    getExecutionStatus(executionId: string): Promise<ProviderResult<N8NExecution>>;
}
