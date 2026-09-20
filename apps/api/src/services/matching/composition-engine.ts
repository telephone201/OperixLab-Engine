/**
 * @file composition-engine.ts
 * @description Implements the logic for composing multiple existing workflows
 * into a unified solution blueprint.
 *
 * Composition is a blueprinting engine, NOT a workflow builder.
 */

import { db } from '../lib/db';
import { HardGateEvaluator, GateStatus } from './hard-gate-evaluator';

export enum CompositionStatus {
    DRAFT = 'DRAFT',
    PENDING_REVIEW = 'PENDING_REVIEW',
    APPROVED = 'APPROVED',
    EDIT_REQUIRED = 'EDIT_REQUIRED',
    REJECTED = 'REJECTED',
    SEARCH_AGAIN = 'SEARCH_AGAIN'
}

export interface ComponentResponsibility {
    workflowId: string;
    role: string; // e.g., "Lead Ingestion", "CRM Processing"
    coveredRequirements: string[]; // Requirement IDs
}

export interface DataMapping {
    sourceWorkflowId: string;
    sourceField: string;
    targetWorkflowId: string;
    targetField: string;
    transformation: string; // e.g., "Direct", "TypeCast", "Normalize"
    isRequired: boolean;
}

export interface CompositionBlueprint {
    compositionId: string;
    solutionId: string;
    version: number;
    components: ComponentResponsibility[];
    executionOrder: string[]; // Order of workflowIds
    triggerModel: {
        primaryTrigger: string;
        sequencing: string; // "Sequential", "Parallel", "Conditional"
    };
    mappings: DataMapping[];
    securityAnalysis: string;
    licenseAnalysis: string;
    conflicts: string[];
    unresolvedItems: string[];
    coverageSummary: {
        mustCovered: boolean;
        shouldCovered: number;
        couldCovered: number;
    };
    humanReviewState: CompositionStatus;
}

export class CompositionEngine {
    constructor(private gateEvaluator: HardGateEvaluator) {}

    /**
     * Attempts to compose a solution from a pool of candidates.
     */
    async compose(
        leadId: string,
        candidates: any[],
        requirements: any[]
    ): Promise<{ blueprint: CompositionBlueprint | null, status: string }> {
        console.log(`[COMPOSITION] Attempting to compose solution for lead ${leadId}...`);

        // 1. Filter Candidates by Hard Gates (must be eligible for composition)
        const eligibleCandidates = [];
        for (const cand of candidates) {
            const { isEligible } = await this.gateEvaluator.evaluate(cand.id, cand.workflow_id, requirements);
            if (isEligible) eligibleCandidates.push(cand);
        }

        if (eligibleCandidates.length === 0) {
            return { blueprint: null, status: 'NO_ELIGIBLE_COMPONENTS' };
        }

        // 2. Determine Minimal Set for MUST Coverage
        const selectedComponents = this.selectMinimalCoveringSet(eligibleCandidates, requirements);

        if (!selectedComponents) {
            return { blueprint: null, status: 'MUST_REQUIREMENTS_UNRESOLVED' };
        }

        // 3. Evaluate Compatibility & Map Data
        const mappings = this.generateDataMappings(selectedComponents, requirements);
        const conflicts = this.detectConflicts(selectedComponents, mappings);

        if (conflicts.some(c => c.severity === 'CRITICAL')) {
            return { blueprint: null, status: 'CRITICAL_CONFLICTS_DETECTED' };
        }

        // 4. Construct Blueprint
        const blueprint: CompositionBlueprint = {
            compositionId: `comp_${Date.now()}`,
            solutionId: `sol_${leadId}`,
            version: 1,
            components: selectedComponents.map(c => ({
                workflowId: c.workflow_id,
                role: this.determineRole(c),
                coveredRequirements: this.getCoveredReqs(c, requirements)
            })),
            executionOrder: selectedComponents.map(c => c.workflow_id),
            triggerModel: {
                primaryTrigger: selectedComponents[0].triggers[0],
                sequencing: 'Sequential'
            },
            mappings: mappings,
            securityAnalysis: 'Aggregated security check: All components pass individual gates.',
            licenseAnalysis: 'Mixed license set: Requires human review of component usage rights.',
            conflicts: conflicts.map(c => c.description),
            unresolvedItems: [],
            coverageSummary: {
                mustCovered: true,
                shouldCovered: 0, // Calculated in real impl
                couldCovered: 0
            },
            humanReviewState: CompositionStatus.PENDING_REVIEW
        };

        return { blueprint, status: 'SUCCESS' };
    }

    private selectMinimalCoveringSet(candidates: any[], requirements: any[]): any[] | null {
        const mustReqs = requirements.filter(r => r.priority === 'MUST');
        const selected: any[] = [];
        const coveredIds = new Set<string>();

        // Simple greedy algorithm for set cover
        while (coveredIds.size < mustReqs.length) {
            let bestCandidate = null;
            let bestNewCoverage = 0;

            for (const cand of candidates) {
                const coverage = mustReqs.filter(r =>
                    !coveredIds.has(r.id) &&
                    this.checkCoverage(cand, r)
                ).length;

                if (coverage > bestNewCoverage) {
                    bestNewCoverage = coverage;
                    bestCandidate = cand;
                }
            }

            if (!bestCandidate) break; // No more progress possible

            selected.push(bestCandidate);
            mustReqs.forEach(r => {
                if (this.checkCoverage(bestCandidate, r)) coveredIds.add(r.id);
            });
        }

        return coveredIds.size === mustReqs.length ? selected : null;
    }

    private checkCoverage(workflow: any, req: any): boolean {
        // Logic: Check if workflow metadata provides the required capability
        return workflow.integrations.some((i: string) => req.integration_requirements?.includes(i)) ||
               workflow.description.toLowerCase().includes(req.title.toLowerCase());
    }

    private generateDataMappings(components: any[], requirements: any[]): DataMapping[] {
        const mappings: DataMapping[] = [];
        for (let i = 0; i < components.length - 1; i++) {
            mappings.push({
                sourceWorkflowId: components[i].workflow_id,
                sourceField: 'output_data',
                targetWorkflowId: components[i+1].workflow_id,
                targetField: 'input_data',
                transformation: 'Direct',
                isRequired: true
            });
        }
        return mappings;
    }

    private detectConflicts(components: any[], mappings: DataMapping[]): { severity: 'CRITICAL' | 'WARNING', description: string }[] {
        const conflicts: { severity: 'CRITICAL' | 'WARNING', description: string }[] = [];

        // 1. Check for duplicate responsibilities
        const roles = components.map(c => this.determineRole(c));
        const uniqueRoles = new Set(roles);
        if (uniqueRoles.size < roles.length) {
            conflicts.push({ severity: 'WARNING', description: 'Redundant components detected.' });
        }

        return conflicts;
    }

    private determineRole(workflow: any): string {
        if (workflow.triggers.includes('Webhook')) return 'Ingestion';
        if (workflow.integrations.includes('CRM')) return 'Processing';
        return 'Utility';
    }

    private getCoveredReqs(workflow: any, requirements: any[]): string[] {
        return requirements
            .filter(r => this.checkCoverage(workflow, r))
            .map(r => r.id);
    }
}
