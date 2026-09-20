/**
 * @file requirement-prompt-generator.ts
 * @description Generates structured prompts for Requirement Extraction while enforcing Zero Cost Mode.
 */

import { RequirementType } from './requirement-types';

export class RequirementPromptGenerator {
    /**
     * Generates a structured prompt for a manual AI task (Perplexity/Gemini).
     * Strictly forbids solutioning and requires evidence-based requirements.
     */
    generatePrompt(data: {
        companyName: string;
        industry: string;
        website: string;
        researchSummary: string;
        researchEvidence: any[];
        painAnalysis: any; // Includes primary/secondary pains and their evidence
        qualificationSummary: string;
    }): string {
        return `
# TASK: REQUIREMENTS EXTRACTION
You are an expert Business Systems Analyst. Your goal is to transform identified business pains into structured functional and non-functional requirements.

## COMPANY CONTEXT
- Name: ${data.companyName}
- Industry: ${data.industry}
- Website: ${data.website}

## INPUT INTELLIGENCE
### Validated Business Pains:
${data.painAnalysis.pains.map((p: any) => `- [${p.id}] ${p.title}: ${p.description} (Severity: ${p.severity}, Evidence: ${p.evidenceType})`).join('\n')}

### Supporting Research Evidence:
${data.researchEvidence.map((e, i) => `[${i}] ${e.text} (Source: ${e.url})`).join('\n')}

### Qualification Summary:
${data.qualificationSummary}

## STRICT CONSTRAINTS
1. SOLUTION-AGNOSTIC: Do NOT suggest specific software, tools, APIs, or workflows.
   - BAD: "Use an n8n webhook to capture leads."
   - GOOD: "The solution must receive new lead information from the configured source."
2. NO FABRICATION: Every requirement must be derived from the provided pains and evidence.
3. DISTINGUISH CERTAINTY: Label each requirement as:
   - CONFIRMED: Directly stated or explicitly required.
   - INFERRED: Reasonably derived from the pain point.
   - UNKNOWN: A logical requirement where evidence is missing.
4. BUSINESS-FOCUSED: Describe the "What", not the "How".
5. NO IMPLEMENTATION DETAILS: Do not mention n8n, Zapier, Make, or specific database schemas.

## OUTPUT FORMAT
For each extracted requirement, provide:
- TITLE: Concise, capability-oriented title.
- TYPE: (Choose from: FUNCTIONAL, NON_FUNCTIONAL, BUSINESS_RULE, DATA, INTEGRATION, SECURITY, HUMAN_IN_THE_LOOP, OPERATIONAL, REPORTING, NOTIFICATION, USER_EXPERIENCE, COMPLIANCE, CONSTRAINT)
- DESCRIPTION: "The solution must/should [capability] when [condition] so that [outcome]."
- SOURCE_PAIN: [ID of the pain this addresses]
- EVIDENCE_SOURCES: [Index of research evidence]
- CERTAINTY: (CONFIRMED | INFERRED | UNKNOWN)
- CONFIDENCE: (LOW | MEDIUM | HIGH)
- PRIORITY: (MUST | SHOULD | COULD)
- AUTOMATION_BOUNDARY: (AUTOMATABLE | PARTIALLY_AUTOMATABLE | HUMAN_REQUIRED)
- ACCEPTANCE_CRITERIA: Business-observable conditions for success.
- UNRESOLVED_QUESTIONS: What information is missing to fully define this requirement?
`.trim();
    }
}
