/**
 * @file requirement-extractor.ts
 * @description Parses structured AI responses into candidate requirements.
 */

import {
    Requirement,
    RequirementCertainty,
    RequirementType,
    AutomationBoundary
} from './requirement-types';

export class RequirementExtractor {
    extract(aiResponse: string): Requirement[] {
        const payload = this.parseJson(aiResponse);

        const rawRequirements = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.requirements)
                ? payload.requirements
                : [];

        return rawRequirements
            .map((item: any, index: number) => this.normalize(item, index))
            .filter((item: Requirement | null): item is Requirement => item !== null);
    }

    private parseJson(aiResponse: string): any {
        if (!aiResponse || typeof aiResponse !== 'string') {
            throw new Error('INVALID_AI_RESPONSE');
        }

        const cleaned = aiResponse
            .trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            const objectStart = cleaned.indexOf('{');
            const arrayStart = cleaned.indexOf('[');

            const starts = [objectStart, arrayStart].filter(i => i >= 0);
            if (starts.length === 0) {
                throw new Error('INVALID_AI_RESPONSE_JSON');
            }

            const start = Math.min(...starts);
            const objectEnd = cleaned.lastIndexOf('}');
            const arrayEnd = cleaned.lastIndexOf(']');

            const end = Math.max(objectEnd, arrayEnd);

            if (end <= start) {
                throw new Error('INVALID_AI_RESPONSE_JSON');
            }

            try {
                return JSON.parse(cleaned.slice(start, end + 1));
            } catch {
                throw new Error('INVALID_AI_RESPONSE_JSON');
            }
        }
    }

    private normalize(item: any, index: number): Requirement | null {
        if (!item || typeof item !== 'object') return null;

        const title = this.asNonEmptyString(item.title);
        const description = this.asNonEmptyString(item.description);

        if (!title || !description) return null;

        const type = this.asRequirementType(item.type);
        const certainty = this.asCertainty(item.certainty);

        return {
            id: this.asNonEmptyString(item.id) || `req_candidate_${index + 1}`,
            analysisId: this.asNonEmptyString(item.analysisId) || '',
            sourcePainId: this.asOptionalString(item.sourcePainId),
            type,
            category: this.asOptionalString(item.category),
            title,
            description,
            priority: this.asPriority(item.priority),
            certainty,
            confidence: this.asConfidence(item.confidence),
            status: 'CANDIDATE',
            triggerDefinition: this.asOptionalString(item.triggerDefinition),
            inputDefinition: item.inputDefinition,
            outputDefinition: item.outputDefinition,
            acceptanceCriteria: item.acceptanceCriteria,
            businessRule: this.asOptionalString(item.businessRule),
            dataRequirements: item.dataRequirements,
            integrationRequirements: item.integrationRequirements,
            humanActionRequired: Boolean(item.humanActionRequired),
            constraints: this.asOptionalString(item.constraints),
            securityRequirements: this.asOptionalString(item.securityRequirements),
            automationBoundary: this.asAutomationBoundary(item.automationBoundary),
            reasoning: this.asNonEmptyString(item.reasoning) || 'Extracted from AI analysis.',
            version: Number.isInteger(item.version) ? item.version : 1,
            evidence: Array.isArray(item.evidence) ? item.evidence : []
        };
    }

    private asNonEmptyString(value: unknown): string | null {
        return typeof value === 'string' && value.trim().length > 0
            ? value.trim()
            : null;
    }

    private asOptionalString(value: unknown): string | undefined {
        const result = this.asNonEmptyString(value);
        return result || undefined;
    }

    private asConfidence(value: unknown): number {
        const number = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(1, number));
    }

    private asPriority(value: unknown): Requirement['priority'] {
        return value === 'MUST' ||
            value === 'SHOULD' ||
            value === 'COULD' ||
            value === 'UNKNOWN'
            ? value
            : 'UNKNOWN';
    }

    private asRequirementType(value: unknown): RequirementType {
        const allowed: RequirementType[] = [
            'FUNCTIONAL',
            'NON_FUNCTIONAL',
            'BUSINESS_RULE',
            'DATA',
            'INTEGRATION',
            'SECURITY',
            'HUMAN_IN_THE_LOOP',
            'OPERATIONAL',
            'REPORTING',
            'NOTIFICATION',
            'USER_EXPERIENCE',
            'COMPLIANCE',
            'CONSTRAINT'
        ];

        return typeof value === 'string' && allowed.includes(value as RequirementType)
            ? value as RequirementType
            : 'FUNCTIONAL';
    }

    private asCertainty(value: unknown): RequirementCertainty {
        return value === 'CONFIRMED' ||
            value === 'INFERRED' ||
            value === 'UNKNOWN'
            ? value
            : 'UNKNOWN';
    }

    private asAutomationBoundary(value: unknown): AutomationBoundary {
        return value === 'AUTOMATABLE' ||
            value === 'PARTIALLY_AUTOMATABLE' ||
            value === 'HUMAN_REQUIRED' ||
            value === 'UNKNOWN'
            ? value
            : 'UNKNOWN';
    }
}
