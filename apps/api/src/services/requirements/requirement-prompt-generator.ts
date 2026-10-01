/**
 * @file requirement-prompt-generator.ts
 * @description Generates structured prompts for evidence-based, solution-agnostic requirement extraction.
 */

export class RequirementPromptGenerator {
    generatePrompt(data: {
        companyName: string;
        industry: string;
        website: string;
        researchSummary: string;
        researchEvidence: any[];
        painAnalysis: any;
        qualificationSummary: string;
    }): string {
        return `
# TASK: REQUIREMENTS EXTRACTION

You are an expert Business Systems Analyst.

Transform the validated business pains, research evidence, and qualification context into structured business requirements.

Your job is to define WHAT the business needs, not HOW it should be implemented.

## COMPANY CONTEXT

- Name: ${data.companyName}
- Industry: ${data.industry}
- Website: ${data.website}

## INPUT INTELLIGENCE

### Validated Business Pains

${data.painAnalysis.pains.map((p: any) =>
    `- [${p.id}] ${p.title}: ${p.description} (Severity: ${p.severity}, Evidence: ${p.evidenceType})`
).join('\n')}

### Supporting Research Evidence

${data.researchEvidence.map((e) =>
    `[${e.id}] ${e.text} (Source: ${e.sourceUrl})`
).join('\n')}

### Qualification Summary

${data.qualificationSummary}

## STRICT REQUIREMENTS

1. SOLUTION-AGNOSTIC
   Describe business capabilities only.
   Do NOT prescribe software, platforms, APIs, databases, automation tools, workflow engines, vendors, or implementation architecture.

   BAD:
   "Use an n8n webhook to capture new leads."

   GOOD:
   "The solution must receive new lead information from the configured lead source."

2. NO FABRICATION
   Every requirement must be supported by the supplied pain analysis or research evidence.
   If important information is missing, represent the uncertainty explicitly rather than inventing details.

3. WHAT, NOT HOW
   Describe the required business behavior, trigger, information, outcome, rule, or human action.
   Do not describe implementation steps.

4. CERTAINTY
   Use exactly one:
   - CONFIRMED: directly stated or explicitly required by evidence.
   - INFERRED: reasonably derived from the evidence.
   - UNKNOWN: potentially required but not supported sufficiently by evidence.

5. CONFIDENCE
   Return a numeric value between 0 and 1.
   Do not return LOW, MEDIUM, or HIGH.

6. PRIORITY
   Use exactly one:
   - MUST
   - SHOULD
   - COULD
   - UNKNOWN

7. EVIDENCE
   Every requirement should reference the evidence that supports it.
   Use the exact evidence IDs supplied in the input.
   Do not invent evidence IDs.

8. INTEGRATIONS
   Only identify an integration when the business need is supported by the evidence.
   Describe the required business system or external capability, not a specific automation implementation.

9. TRIGGERS
   Define the business event or condition that causes the required behavior.
   Do not describe technical trigger mechanisms.

10. INPUTS AND OUTPUTS
    Describe the business information entering and leaving the capability.
    Do not describe database schemas, API payloads, workflow nodes, or technical implementation objects.

11. HUMAN INVOLVEMENT
    Set humanActionRequired to true only when the requirement explicitly requires human review, approval, decision, verification, or intervention.

12. SECURITY
    Only identify security requirements supported by the evidence or clearly required by the nature of the stated business need.
    Do not invent specific security technologies.

13. ACCEPTANCE CRITERIA
    Criteria must be observable from a business user's perspective.
    Do not describe implementation tests.

14. JSON ONLY
    Return valid JSON.
    Do not wrap the response in Markdown fences.
    Do not add commentary before or after the JSON.

## OUTPUT CONTRACT

Return an object with this exact top-level structure:

{
  "requirements": [
    {
      "id": "optional-stable-id",
      "analysisId": "",
      "sourcePainId": "pain-id-or-null",
      "type": "FUNCTIONAL | NON_FUNCTIONAL | BUSINESS_RULE | DATA | INTEGRATION | SECURITY | HUMAN_IN_THE_LOOP | OPERATIONAL | REPORTING | NOTIFICATION | USER_EXPERIENCE | COMPLIANCE | CONSTRAINT",
      "category": "business capability category or null",
      "title": "concise capability-oriented title",
      "description": "The solution must/should [business capability] when [business condition] so that [business outcome].",
      "priority": "MUST | SHOULD | COULD | UNKNOWN",
      "certainty": "CONFIRMED | INFERRED | UNKNOWN",
      "confidence": 0.0,
      "triggerDefinition": "business event or condition, or null",
      "inputDefinition": {
        "items": []
      },
      "outputDefinition": {
        "items": []
      },
      "acceptanceCriteria": [
        "observable business condition"
      ],
      "businessRule": "business rule or null",
      "dataRequirements": {
        "items": []
      },
      "integrationRequirements": [],
      "humanActionRequired": false,
      "constraints": "business constraint or null",
      "securityRequirements": "supported security requirement or null",
      "automationBoundary": "AUTOMATABLE | PARTIALLY_AUTOMATABLE | HUMAN_REQUIRED | UNKNOWN",
      "reasoning": "brief evidence-based explanation for why this requirement was extracted",
      "version": 1,
      "evidence": [
        {
          "evidenceId": "exact-evidence-id",
          "contributionType": "SUPPORTING | CONTRADICTORY"
        }
      ]
    }
  ]
}

## FIELD RULES

- sourcePainId must reference an actual supplied pain ID or be null.
- evidence[].evidenceId must reference an actual supplied research evidence ID.
- integrationRequirements must be an array of business systems/capabilities supported by evidence.
- inputDefinition and outputDefinition must describe business information, not technical schemas.
- acceptanceCriteria must be an array of observable business outcomes/conditions.
- dataRequirements must describe required business data.
- businessRule must contain only an evidenced business rule.
- securityRequirements must remain null when no supported security requirement exists.
- constraints must remain null when no supported constraint exists.
- Do not create requirements merely to fill optional fields.
- Do not invent missing values.
- If evidence is insufficient, use UNKNOWN certainty and lower confidence.

## FINAL QUALITY CHECK

Before returning the JSON:

1. Every requirement is traceable to at least one supplied pain or evidence item.
2. No requirement contains implementation-specific solutioning.
3. Trigger, input, output, integration, data, security, and human-action fields describe business needs only.
4. Confidence is numeric from 0 to 1.
5. All enum values exactly match the allowed values above.
6. Evidence IDs and pain IDs are not invented.
7. The response is valid JSON and contains no Markdown or explanatory text.
`.trim();
    }
}
