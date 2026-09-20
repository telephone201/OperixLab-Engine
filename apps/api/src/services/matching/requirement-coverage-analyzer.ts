/**
 * @file requirement-coverage-analyzer.ts
 * @description Maps requirements to workflow capabilities to generate a coverage matrix.
 */

export enum CoverageLevel {
    FULL = 'FULL',
    PARTIAL = 'PARTIAL',
    NONE = 'NONE',
    UNKNOWN = 'UNKNOWN',
}

export interface CoverageResult {
    requirementId: string;
    workflowId: string;
    level: CoverageLevel;
    evidence: string;
    confidence: number;
}

export class RequirementCoverageAnalyzer {
    /**
     * Analyzes a candidate workflow against a set of requirements.
     */
    async analyzeCoverage(workflow: any, requirements: any[]): Promise<CoverageResult[]> {
        console.log(`[COVERAGE] Analyzing workflow ${workflow.name} against ${requirements.length} requirements...`);

        const results: CoverageResult[] = [];

        for (const req of requirements) {
            const { level, evidence, confidence } = this.evaluateRequirement(workflow, req);
            results.push({
                requirementId: req.id,
                workflowId: workflow.workflow_id,
                level,
                evidence,
                confidence
            });
        }

        return results;
    }

    private evaluateRequirement(workflow: any, req: any): { level: CoverageLevel, evidence: string, confidence: number } {
        // 1. Check for explicit capability match in metadata
        const hasIntegration = req.integration_requirements &&
            workflow.integrations.some((i: string) =>
                req.integration_requirements.includes(i)
            );

        const hasTrigger = req.trigger_definition &&
            workflow.triggers.some((t: string) =>
                req.trigger_definition.toLowerCase().includes(t.toLowerCase())
            );

        // 2. Determine coverage level
        if (hasIntegration && hasTrigger) {
            return {
                level: CoverageLevel.FULL,
                evidence: `Workflow provides both required integration (${workflow.integrations}) and trigger (${workflow.triggers}).`,
                confidence: 0.9
            };
        }

        if (hasIntegration || hasTrigger) {
            return {
                level: CoverageLevel.PARTIAL,
                evidence: `Workflow provides either integration or trigger, but not both.`,
                confidence: 0.5
            };
        }

        // 3. Fallback to keyword search in description
        if (workflow.description.toLowerCase().includes(req.title.toLowerCase())) {
            return {
                level: CoverageLevel.PARTIAL,
                evidence: `Requirement title found in workflow description.`,
                confidence: 0.3
            };
        }

        return {
            level: CoverageLevel.NONE,
            evidence: 'No matching capabilities found in metadata.',
            confidence: 0.1
        };
    }
}


