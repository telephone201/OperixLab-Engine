/**
 * @file pain-prompt-generator.ts
 * @description Generates structured prompts for AI pain analysis while enforcing Zero Cost Mode.
 */

import { PainType } from './pain-types';

export class PainAnalysisPromptGenerator {
    /**
     * Generates a structured prompt for a manual AI task (Perplexity/Gemini).
     * Strictly forbids fabrication and requires evidence-based claims.
     */
    generatePrompt(data: {
        companyName: string;
        industry: string;
        website: string;
        researchSummary: string;
        researchEvidence: any[];
        qualificationSummary: string;
        commercialSignals: string[];
        researchGaps: string[];
    }): string {
        return `
# TASK: BUSINESS PAIN ANALYSIS
You are an expert Business Operations Analyst. Your goal is to identify operational pains and business problems for the following company.

## COMPANY CONTEXT
- Name: ${data.companyName}
- Industry: ${data.industry}
- Website: ${data.website}

## PROVIDED INTELLIGENCE
### Research Summary:
${data.researchSummary}

### Key Evidence:
${data.researchEvidence.map((e, i) => `[${i}] ${e.text} (Source: ${e.url})`).join('\n')}

### Qualification & Signals:
${data.qualificationSummary}
Commercial Signals: ${data.commercialSignals.join(', ') || 'None observed'}

### Known Information Gaps:
${data.researchGaps.join('\n') || 'None identified'}

## STRICT CONSTRAINTS
1. NO FABRICATION: Do not invent revenue losses, missed sales, or specific labor costs unless explicitly stated in the evidence.
2. EVIDENCE-BASED: Every identified pain must be linked to a source [Index] from the Key Evidence section.
3. DISTINGUISH TRUTH: Explicitly label every claim as:
   - OBSERVED: Directly stated in evidence.
   - INFERRED: Strongly suggested by evidence but not explicitly stated.
   - UNKNOWN: Insufficient evidence to confirm.
4. BUSINESS-ORIENTED: Use business language. Do NOT suggest technical tools, APIs, or workflows. Focus on the PROBLEM, not the SOLUTION.
5. NO METRICS: Do not invent percentages or dollar amounts.

## OUTPUT FORMAT
For each identified pain, provide:
- TITLE: Concise business-oriented title.
- CATEGORY: (Choose from: LEAD_MANAGEMENT, CUSTOMER_SUPPORT, SALES_PROCESS, MARKETING, FOLLOW_UP, SCHEDULING, DATA_ENTRY, REPORTING, CRM_OPERATIONS, COMMUNICATION, ORDER_PROCESSING, INTERNAL_OPERATIONS, DOCUMENT_PROCESSING, APPROVAL_PROCESS, INTEGRATION, DATA_FRAGMENTATION, MANUAL_REPETITIVE_WORK, RESPONSE_DELAY, VISIBILITY_GAP)
- DESCRIPTION: What is happening, why it matters, and what evidence supports it.
- EVIDENCE TYPE: (OBSERVED | INFERRED | UNKNOWN)
- SEVERITY: (LOW | MEDIUM | HIGH | CRITICAL)
- FREQUENCY: (RARE | OCCASIONAL | REGULAR | FREQUENT | CONTINUOUS)
- POTENTIAL IMPACT: (Operational, Commercial, or Customer impact)
- CONFIDENCE: (LOW | MEDIUM | HIGH)
- SOURCES: [Index of evidence]
- UNKNOWNs: What specific information is missing to confirm this pain?
`.trim();
    }
}
