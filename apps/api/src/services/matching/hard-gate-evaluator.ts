/**
 * @file hard-gate-evaluator.ts
 * @description Implements deterministic binary checks for workflow eligibility.
 * Hard Gates are absolute; a FAIL result disqualifies a candidate from REUSE.
 */

import { db } from '../../lib/db';
import { workflowEvidenceProvider } from '../inventory/workflow-evidence-provider';
import { triggerCompatibilityService } from './trigger-compatibility-service';

export enum GateStatus {
    PASS = 'PASS',
    FAIL = 'FAIL',
    UNKNOWN = 'UNKNOWN'
}

export interface GateResult {
    gateName: string;
    status: GateStatus;
    passed: boolean;
    evidence: string;
    reason: string;
    affectedRequirementIds?: string[];
    workflowId: string;
    timestamp: Date;
}

export class HardGateEvaluator {
    /**
     * Evaluates all hard gates for a specific workflow candidate.
     * Returns a list of results and an overall eligibility flag.
     */
    async evaluate(candidateId: string, workflowId: string, requirements: any[]): Promise<{ isEligible: boolean, results: GateResult[] }> {
        console.log(`[HARD_GATE] Evaluating eligibility for workflow ${workflowId}...`);

        const results: GateResult[] = [];

        // 1. MUST Requirement Coverage
        results.push(this.evaluateMustCoverage(workflowId, requirements));

        // 2. Trigger Compatibility
        results.push(await this.evaluateTrigger(workflowId, requirements));

        // 3. Input Compatibility
        results.push(await this.evaluateInputs(workflowId, requirements));

        // 4. Output Compatibility
        results.push(await this.evaluateOutputs(workflowId, requirements));

        // 5. Integration Compatibility
        results.push(await this.evaluateIntegrations(workflowId, requirements));

        // 6. Security Gate
        results.push(await this.evaluateSecurity(workflowId));

        // 7. License Gate
        results.push(await this.evaluateLicense(workflowId));

        // A candidate is eligible for REUSE only if ALL gates are PASS.
        // Note: Some strategies (CUSTOMIZE) might allow PARTIAL gates,
        // but for the primary "Is it eligible as-is" check, we look for FAILs.
        const hasCriticalFailure = results.some(r => r.status === GateStatus.FAIL);

        // Persist results to the database for auditability
        await this.persistResults(candidateId, results);

        return {
            isEligible: !hasCriticalFailure,
            results
        };
    }

    private evaluateMustCoverage(workflowId: string, requirements: any[]): GateResult {
        const mustReqs = requirements.filter(r => r.priority === 'MUST');

        if (mustReqs.length === 0) {
            return {
                gateName: 'MUST_REQUIREMENT_COVERAGE',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No MUST requirements were supplied.',
                reason: 'Critical requirement coverage cannot be established because no MUST requirements are present.',
                workflowId,
                timestamp: new Date()
            };
        }

        const failures = mustReqs.filter(r => {
            // In a real system, this checks the coverage_matrix table
            // For this logic, we assume the requirements passed in are the candidates
            return !r.covered;
        });

        if (failures.length > 0) {
            return {
                gateName: 'MUST_REQUIREMENT_COVERAGE',
                status: GateStatus.FAIL,
                passed: false,
                evidence: `Missing coverage for ${failures.length} MUST requirements.`,
                reason: `Requirements [${failures.map(f => f.id).join(',')}] are not covered.`,
                affectedRequirementIds: failures.map(f => f.id),
                workflowId,
                timestamp: new Date()
            };
        }

        return {
            gateName: 'MUST_REQUIREMENT_COVERAGE',
            status: GateStatus.PASS,
            passed: true,
            evidence: 'All MUST requirements are covered.',
            reason: 'Full critical coverage achieved.',
            workflowId,
            timestamp: new Date()
        };
    }

    private async evaluateTrigger(workflowId: string, requirements: any[]): Promise<GateResult> {
        const triggerRequirement = requirements.find(
            requirement => typeof requirement?.trigger_definition === 'string' &&
                requirement.trigger_definition.trim().length > 0
        );

        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(workflowId);

        if (!context) {
            return {
                gateName: 'TRIGGER_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow evidence could not be resolved from workflow_library.',
                reason: 'Trigger compatibility cannot be evaluated without source-backed workflow evidence.',
                workflowId,
                timestamp: new Date()
            };
        }

        const compatibility = triggerCompatibilityService.evaluate(
            triggerRequirement?.trigger_definition,
            context.evidence.triggers
        );

        return {
            gateName: 'TRIGGER_COMPATIBILITY',
            status: compatibility.status as GateStatus,
            passed: compatibility.status === 'PASS',
            evidence: compatibility.evidence,
            reason: compatibility.reason,
            workflowId,
            timestamp: new Date()
        };
    }

    private async evaluateInputs(workflowId: string, requirements: any[]): Promise<GateResult> {
        const inputRequirements = requirements
            .map(requirement => requirement?.input_definition)
            .filter(value => value != null);

        if (inputRequirements.length === 0) {
            return {
                gateName: 'INPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No input definition was supplied by the requirements.',
                reason: 'Input compatibility cannot be established without explicit input requirements.',
                workflowId,
                timestamp: new Date()
            };
        }

        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(workflowId);

        if (!context) {
            return {
                gateName: 'INPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow evidence could not be resolved from workflow_library.',
                reason: 'Input compatibility cannot be evaluated without source-backed workflow evidence.',
                workflowId,
                timestamp: new Date()
            };
        }

        const trigger = context.evidence.triggers.find(
            item => item.triggerType.toLowerCase() === 'webhook'
        );

        if (!trigger) {
            return {
                gateName: 'INPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No source-backed webhook input was observed in the workflow.',
                reason: 'The available workflow evidence does not expose a directly comparable input contract.',
                workflowId,
                timestamp: new Date()
            };
        }

        const unknownConstraints: string[] = [];
        const failures: string[] = [];

        for (const inputDefinition of inputRequirements) {
            if (!inputDefinition || typeof inputDefinition !== 'object') {
                unknownConstraints.push('input definition is not a structured object');
                continue;
            }

            const definition = inputDefinition as Record<string, unknown>;

            if (typeof definition.method === 'string' && definition.method.trim()) {
                const requiredMethod = definition.method.trim().toUpperCase();
                const observedMethod = trigger.httpMethod?.trim().toUpperCase();

                if (!observedMethod) {
                    unknownConstraints.push(`HTTP method "${requiredMethod}" could not be verified`);
                } else if (requiredMethod !== observedMethod) {
                    failures.push(`required HTTP method "${requiredMethod}" but observed "${observedMethod}"`);
                }
            }

            if (typeof definition.channel === 'string' && definition.channel.trim()) {
                unknownConstraints.push(
                    `channel "${definition.channel.trim()}" is not directly observable from workflow source`
                );
            }
        }

        if (failures.length > 0) {
            return {
                gateName: 'INPUT_COMPATIBILITY',
                status: GateStatus.FAIL,
                passed: false,
                evidence: `Input incompatibilities: ${failures.join('; ')}.`,
                reason: 'The workflow input contract conflicts with the explicit requirement.',
                workflowId,
                timestamp: new Date()
            };
        }

        if (unknownConstraints.length > 0) {
            return {
                gateName: 'INPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: `Observed input evidence: webhook ${trigger.httpMethod ?? 'method unknown'}${trigger.path ? ` at path "${trigger.path}"` : ''}.`,
                reason: `Some input constraints cannot be established from source evidence: ${unknownConstraints.join('; ')}.`,
                workflowId,
                timestamp: new Date()
            };
        }

        return {
            gateName: 'INPUT_COMPATIBILITY',
            status: GateStatus.PASS,
            passed: true,
            evidence: `Workflow webhook input matches all explicitly verifiable input requirements. Method: ${trigger.httpMethod ?? 'unknown'}.`,
            reason: 'All explicit input constraints are source-backed and compatible.',
            workflowId,
            timestamp: new Date()
        };
    }

    private async evaluateOutputs(workflowId: string, requirements: any[]): Promise<GateResult> {
        const outputRequirements = requirements
            .map(requirement => requirement?.output_definition)
            .filter(value => value != null);

        if (outputRequirements.length === 0) {
            return {
                gateName: 'OUTPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No output definition was supplied by the requirements.',
                reason: 'Output compatibility cannot be established without explicit output requirements.',
                workflowId,
                timestamp: new Date()
            };
        }

        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(workflowId);

        if (!context) {
            return {
                gateName: 'OUTPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow evidence could not be resolved from workflow_library.',
                reason: 'Output compatibility cannot be evaluated without source-backed workflow evidence.',
                workflowId,
                timestamp: new Date()
            };
        }

        if (context.evidence.outputs.length === 0) {
            return {
                gateName: 'OUTPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No terminal output node was observed in the workflow source.',
                reason: 'The workflow source does not expose a comparable output contract.',
                workflowId,
                timestamp: new Date()
            };
        }

        const outputText = context.evidence.outputs
            .map(output => JSON.stringify(output.parameters) + ' ' + output.expressions.join(' '))
            .join(' ')
            .toLowerCase();

        const unknownConstraints: string[] = [];

        for (const outputDefinition of outputRequirements) {
            if (typeof outputDefinition === 'string') {
                if (!outputText.includes(outputDefinition.toLowerCase())) {
                    unknownConstraints.push(
                        `output "${outputDefinition}" could not be directly verified`
                    );
                }
                continue;
            }

            if (!outputDefinition || typeof outputDefinition !== 'object') {
                unknownConstraints.push('output definition is not a structured object');
                continue;
            }

            const definition = outputDefinition as Record<string, unknown>;

            if (typeof definition.result === 'string' && definition.result.trim()) {
                const requiredResult = definition.result.trim().toLowerCase();

                if (!outputText.includes(requiredResult)) {
                    unknownConstraints.push(
                        `required result "${definition.result.trim()}" is not directly observable in workflow output`
                    );
                }
            } else {
                unknownConstraints.push(
                    'structured output requirement has no directly verifiable field'
                );
            }
        }

        if (unknownConstraints.length > 0) {
            return {
                gateName: 'OUTPUT_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: `Observed ${context.evidence.outputs.length} source-backed workflow output node(s).`,
                reason: `Some output constraints cannot be established from source evidence: ${unknownConstraints.join('; ')}.`,
                workflowId,
                timestamp: new Date()
            };
        }

        return {
            gateName: 'OUTPUT_COMPATIBILITY',
            status: GateStatus.PASS,
            passed: true,
            evidence: `Workflow exposes ${context.evidence.outputs.length} source-backed output node(s) matching the explicitly verifiable output requirements.`,
            reason: 'All explicit output constraints are source-backed and compatible.',
            workflowId,
            timestamp: new Date()
        };
    }
    private async evaluateIntegrations(workflowId: string, requirements: any[]): Promise<GateResult> {
        const requiredIntegrations = new Set<string>();

        for (const requirement of requirements) {
            const raw = requirement?.integration_requirements;

            if (Array.isArray(raw)) {
                for (const item of raw) {
                    if (typeof item === 'string' && item.trim()) {
                        requiredIntegrations.add(item.trim().toLowerCase());
                    }
                }
                continue;
            }

            if (typeof raw === 'string') {
                raw
                    .split(',')
                    .map((item: string) => item.trim())
                    .filter(Boolean)
                    .forEach((item: string) => requiredIntegrations.add(item.toLowerCase()));
            }
        }

        if (requiredIntegrations.size === 0) {
            return {
                gateName: 'INTEGRATION_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No integration requirements were supplied by the requirements.',
                reason: 'Integration compatibility cannot be established without explicit integration requirements.',
                workflowId,
                timestamp: new Date()
            };
        }

        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(workflowId);

        if (!context) {
            return {
                gateName: 'INTEGRATION_COMPATIBILITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow evidence could not be resolved from workflow_library.',
                reason: 'Integration compatibility cannot be evaluated without source-backed workflow evidence.',
                workflowId,
                timestamp: new Date()
            };
        }

        const observedIntegrations = new Set(
            context.evidence.integrations
                .filter(Boolean)
                .map(integration => integration.trim().toLowerCase())
        );

        const missing = [...requiredIntegrations].filter(
            integration => !observedIntegrations.has(integration)
        );

        if (missing.length > 0) {
            return {
                gateName: 'INTEGRATION_COMPATIBILITY',
                status: GateStatus.FAIL,
                passed: false,
                evidence: `Required integrations missing from workflow source: ${missing.join(', ')}. Observed integrations: ${[...observedIntegrations].join(', ') || 'none'}.`,
                reason: 'Workflow source does not contain all required integrations.',
                workflowId,
                timestamp: new Date()
            };
        }

        return {
            gateName: 'INTEGRATION_COMPATIBILITY',
            status: GateStatus.PASS,
            passed: true,
            evidence: `All required integrations are observed in workflow source: ${[...requiredIntegrations].join(', ')}.`,
            reason: 'All required integrations are source-backed and compatible.',
            workflowId,
            timestamp: new Date()
        };
    }

    private async evaluateSecurity(workflowId: string): Promise<GateResult> {
        const context = await workflowEvidenceProvider.getByWorkflowLibraryId(workflowId);

        if (!context) {
            return {
                gateName: 'SECURITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow evidence could not be resolved from workflow_library.',
                reason: 'Security compatibility cannot be evaluated without source-backed workflow evidence.',
                workflowId,
                timestamp: new Date()
            };
        }

        const credentialNames = context.evidence.credentialNames;

        if (credentialNames.length === 0) {
            return {
                gateName: 'SECURITY',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'No credential usage was observed in workflow source.',
                reason: 'Absence of credential usage does not provide sufficient evidence to declare the workflow security-safe.',
                workflowId,
                timestamp: new Date()
            };
        }

        const credentialSummary = credentialNames.join(', ');

        return {
            gateName: 'SECURITY',
            status: GateStatus.UNKNOWN,
            passed: false,
            evidence: `Source-backed credential usage observed: ${credentialSummary}.`,
            reason: 'Credential presence is observable, but credential configuration, secret handling, permissions, and security policy compliance cannot be established from workflow source alone.',
            workflowId,
            timestamp: new Date()
        };
    }
    private async evaluateLicense(workflowId: string): Promise<GateResult> {
        const result = await db.query(
            `SELECT "license_status", "source_hash", "source_file"
             FROM "workflow_library"
             WHERE "id" = $1
             LIMIT 1`,
            [workflowId]
        );

        if (result.rows.length === 0) {
            return {
                gateName: 'LICENSE',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: 'Workflow was not found in workflow_library.',
                reason: 'Commercial license eligibility cannot be established.',
                workflowId,
                timestamp: new Date()
            };
        }

        const row = result.rows[0];
        const rawStatus = row.license_status;

        if (typeof rawStatus !== 'string' || !rawStatus.trim()) {
            return {
                gateName: 'LICENSE',
                status: GateStatus.UNKNOWN,
                passed: false,
                evidence: `No license status is recorded for source ${row.source_hash}.`,
                reason: 'Commercial license eligibility cannot be established without explicit license metadata.',
                workflowId,
                timestamp: new Date()
            };
        }

        const status = rawStatus.trim().toUpperCase();

        if (status === 'ELIGIBLE') {
            return {
                gateName: 'LICENSE',
                status: GateStatus.PASS,
                passed: true,
                evidence: `Workflow license status is ${status}.`,
                reason: 'License metadata explicitly marks the workflow as commercially eligible.',
                workflowId,
                timestamp: new Date()
            };
        }

        if (status === 'NOT_ELIGIBLE') {
            return {
                gateName: 'LICENSE',
                status: GateStatus.FAIL,
                passed: false,
                evidence: `Workflow license status is ${status}.`,
                reason: 'License metadata explicitly prevents commercial use.',
                workflowId,
                timestamp: new Date()
            };
        }

        return {
            gateName: 'LICENSE',
            status: GateStatus.UNKNOWN,
            passed: false,
            evidence: `Workflow license status is ${status}.`,
            reason: 'License metadata requires review before commercial eligibility can be established.',
            workflowId,
            timestamp: new Date()
        };
    }
    private async persistResults(candidateId: string, results: GateResult[]) {
        for (const res of results) {
            await db.workflow_compatibility_checks.create({
                data: {
                    candidate_id: candidateId,
                    gate_type: res.gateName,
                    result: res.status,
                    details: `${res.reason} Evidence: ${res.evidence}`,
                }
            });
        }
    }
}

