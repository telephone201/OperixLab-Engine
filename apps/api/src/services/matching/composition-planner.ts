/**
 * @file composition-planner.ts
 * @description Production composition ANALYSIS/PLANNING layer (STEP 9).
 *
 * Determines whether multiple workflow-library candidates can COLLECTIVELY
 * cover a lead's requirements and produces a deterministic CompositionPlan.
 * This is a blueprinting/planning engine, NOT a workflow builder: it never
 * merges n8n JSON, never generates nodes, never deploys, and never invents
 * confidence scores.
 *
 * DETERMINISM: selection is a greedy set cover over MUST requirements with
 * a documented total tie-break (new MUST coverage desc -> total FULL
 * coverage desc -> workflowLibraryId ASC). No randomness, no timestamps,
 * no database iteration order, no LLM output. The same inputs always
 * produce the same plan.
 *
 * GATE SEMANTICS (FAIL-only hard gates preserved):
 * - A candidate with ANY intrinsic compatibility/safety gate FAIL
 *   (TRIGGER_COMPATIBILITY, INPUT_COMPATIBILITY, OUTPUT_COMPATIBILITY,
 *   INTEGRATION_COMPATIBILITY, SECURITY, LICENSE) is DISQUALIFIED as a
 *   composition component.
 * - MUST_REQUIREMENT_COVERAGE FAILs are NOT disqualifying: that gate is a
 *   per-candidate SINGLE-workflow verdict. A component covering only some
 *   MUST requirements necessarily carries it; composition re-evaluates
 *   coverage COLLECTIVELY over the selected set (MUST coverage remains the
 *   viability gate of the plan itself).
 * - UNKNOWN gates (SECURITY/LICENSE in particular) never disqualify and
 *   are never converted into PASS: they are surfaced as explicit
 *   compatibility concerns and force reviewRequired.
 *
 * REVIEW SEMANTICS: the plan NEVER auto-approves. reviewRequired is true
 * for any multi-component composition (cross-workflow handoff requires
 * explicit design) and whenever any selected component carries an UNKNOWN
 * gate. Uncovered SHOULD requirements are informational only and never
 * fail the composition.
 */

import { CoverageResult } from './requirement-coverage-analyzer';

/**
 * Conservative, documented maximum number of components in one composition.
 * No prior maximum existed anywhere in the architecture (inspected); this
 * constant exists to keep the greedy search space bounded and the resulting
 * plans reviewable. One documented home instead of scattered magic numbers.
 */
export const MAX_COMPOSITION_COMPONENTS = 3;

/** Intrinsic per-workflow gates: a FAIL here disqualifies a component. */
const INTRINSIC_FAIL_GATES = new Set([
    'TRIGGER_COMPATIBILITY',
    'INPUT_COMPATIBILITY',
    'OUTPUT_COMPATIBILITY',
    'INTEGRATION_COMPATIBILITY',
    'SECURITY',
    'LICENSE'
]);

/** Captured genuine gate outcome for one candidate (from the adapter). */
export interface CompositionGateOutcome {
    /** All gate results captured from HardGateEvaluator for the candidate. */
    gateNamesByStatus: { fail: string[]; unknown: string[] };
}

export interface CompositionPlannerCandidate {
    /** workflow_library.id — the component identity. Never substituted. */
    workflowLibraryId: string;
    name: string | null;
    integrations: string[];
    triggers: string[];
}

export interface CompositionPlanInput {
    requirements: { id: string; priority: string | null }[];
    candidates: CompositionPlannerCandidate[];
    /** Authoritative RequirementCoverageAnalyzer output per workflow_library.id. */
    coverageByLibraryId: Map<string, CoverageResult[]>;
    /** Captured genuine gate outcomes per workflow_library.id. */
    gatesByLibraryId: Map<string, CompositionGateOutcome>;
}

export interface CompositionPlanComponent {
    /** workflow_library.id — real UUID, never an alternate identifier. */
    workflowLibraryId: string;
    name: string | null;
    /** Deterministic descriptive role (from observed metadata only). */
    role: string;
    /** Requirement ids covered at FULL level by this component. */
    coversRequirementIds: string[];
    mustRequirementIdsCovered: string[];
    shouldRequirementIdsCovered: string[];
    /** Why this component was selected (deterministic template). */
    selectionReason: string;
    /** Intrinsic FAIL gate names (empty — FAIL-gated candidates are excluded). */
    failedGates: string[];
    /** UNKNOWN gate names carried by this component (review input). */
    unknownGates: string[];
}

export type CompositionPlanStatus =
    | 'VIABLE'
    | 'NOT_ATTEMPTED'
    | 'NO_ELIGIBLE_COMPONENTS'
    | 'MUST_COVERAGE_INCOMPLETE'
    | 'COMPONENT_LIMIT_EXCEEDED';

export interface CompositionPlan {
    strategy: 'COMPOSE';
    status: CompositionPlanStatus;
    viable: boolean;
    components: CompositionPlanComponent[];
    mustRequirementIdsCovered: string[];
    shouldRequirementIdsCovered: string[];
    /** Uncovered requirements of ANY priority (never gating for SHOULD). */
    uncoveredRequirementIds: string[];
    /** MUST requirements left uncovered — the viability failure detail. */
    uncoveredMustRequirementIds: string[];
    /** SHOULD requirements left uncovered — informational only. */
    uncoveredShouldRequirementIds: string[];
    compatibility: {
        reviewRequired: boolean;
        /** Unresolved connection work and gate concerns, explicit. */
        concerns: string[];
    };
    maxComponents: number;
    /** Deterministic explainability summary. */
    reasoning: string;
}

export class CompositionPlanner {
    /**
     * Produces a deterministic CompositionPlan from pre-computed, genuine
     * evidence. Never calls gates, coverage analysis, the ranker or the DB.
     */
    plan(input: CompositionPlanInput): CompositionPlan {
        const mustRequirementIds = sortedIds(
            input.requirements.filter((r) => r.priority === 'MUST').map((r) => r.id)
        );
        const shouldRequirementIds = sortedIds(
            input.requirements.filter((r) => r.priority === 'SHOULD').map((r) => r.id)
        );
        const otherRequirementIds = sortedIds(
            input.requirements
                .filter((r) => r.priority !== 'MUST' && r.priority !== 'SHOULD')
                .map((r) => r.id)
        );

        // 1. Disqualify candidates with intrinsic FAIL gates. Candidates
        //    without captured gate outcomes are excluded (never guess).
        const eligible: CompositionPlannerCandidate[] = [];
        const disqualified: { candidate: CompositionPlannerCandidate; failed: string[] }[] = [];

        for (const candidate of sortedById(input.candidates)) {
            const gates = input.gatesByLibraryId.get(candidate.workflowLibraryId);

            if (!gates) {
                disqualified.push({
                    candidate,
                    failed: ['GATES_NOT_EVALUATED']
                });
                continue;
            }

            const intrinsicFails = gates.gateNamesByStatus.fail.filter((gate) =>
                INTRINSIC_FAIL_GATES.has(gate)
            );

            if (intrinsicFails.length > 0) {
                disqualified.push({ candidate, failed: sortedStrings(intrinsicFails) });
                continue;
            }

            eligible.push(candidate);
        }

        if (eligible.length === 0) {
            return this.notViable(
                input,
                mustRequirementIds,
                shouldRequirementIds,
                otherRequirementIds,
                // Nothing was selected: every MUST is genuinely uncovered.
                mustRequirementIds,
                'NO_ELIGIBLE_COMPONENTS',
                'No candidate without an intrinsic hard-gate FAIL is available for composition.'
            );
        }

        // 2. FULL-coverage membership maps (existing coverage semantics:
        //    only FULL counts as covered — PARTIAL/NONE/UNKNOWN do not).
        const fullCoverage = new Map<string, Set<string>>();
        for (const candidate of eligible) {
            const coverage =
                input.coverageByLibraryId.get(candidate.workflowLibraryId) ?? [];
            const covered = new Set(
                coverage
                    .filter((result) => result.level === 'FULL')
                    .map((result) => result.requirementId)
            );
            fullCoverage.set(candidate.workflowLibraryId, covered);
        }

        // 3. Deterministic greedy set cover over MUST requirements.
        const selected: CompositionPlannerCandidate[] = [];
        const coveredMust = new Set<string>();

        while (coveredMust.size < mustRequirementIds.length) {
            if (selected.length >= MAX_COMPOSITION_COMPONENTS) {
                break;
            }

            let best: CompositionPlannerCandidate | null = null;
            let bestNewMust = 0;
            let bestNewTotal = 0;

            for (const candidate of eligible) {
                if (selected.some((item) => item.workflowLibraryId === candidate.workflowLibraryId)) {
                    continue;
                }

                const covered = fullCoverage.get(candidate.workflowLibraryId) ?? new Set<string>();
                const newMust = mustRequirementIds.filter(
                    (id) => !coveredMust.has(id) && covered.has(id)
                ).length;
                const newTotal = [...mustRequirementIds, ...shouldRequirementIds, ...otherRequirementIds]
                    .filter((id) => covered.has(id)).length;

                // Total tie-break: newMust desc -> newTotal desc -> id ASC
                // (candidates are pre-sorted by id, so iteration order is
                // deterministic regardless of caller ordering).
                if (
                    newMust > bestNewMust ||
                    (newMust === bestNewMust && newTotal > bestNewTotal)
                ) {
                    best = candidate;
                    bestNewMust = newMust;
                    bestNewTotal = newTotal;
                }
            }

            // No candidate adds uncovered MUST coverage — stop without
            // selecting redundant components.
            if (!best || bestNewMust === 0) {
                break;
            }

            selected.push(best);
            const covered = fullCoverage.get(best.workflowLibraryId) ?? new Set<string>();
            for (const id of mustRequirementIds) {
                if (covered.has(id)) {
                    coveredMust.add(id);
                }
            }
        }

        const uncoveredMust = mustRequirementIds.filter((id) => !coveredMust.has(id));

        if (coveredMust.size < mustRequirementIds.length) {
            const status: CompositionPlanStatus =
                selected.length >= MAX_COMPOSITION_COMPONENTS
                    ? 'COMPONENT_LIMIT_EXCEEDED'
                    : 'MUST_COVERAGE_INCOMPLETE';

            return this.notViable(
                input,
                mustRequirementIds,
                shouldRequirementIds,
                otherRequirementIds,
                uncoveredMust,
                status,
                `No viable composition covers all MUST requirements within ${MAX_COMPOSITION_COMPONENTS} components. Uncovered MUST requirements: ${uncoveredMust.join(', ') || 'none'}.`
            );
        }

        // 4. Explainability per selected component (MUST + informational
        //    coverage; deterministic selection reason).
        const components: CompositionPlanComponent[] = selected.map((candidate) => {
            const covered = fullCoverage.get(candidate.workflowLibraryId) ?? new Set<string>();
            const covers = sortedIds(
                [...mustRequirementIds, ...shouldRequirementIds, ...otherRequirementIds].filter(
                    (id) => covered.has(id)
                )
            );
            const mustCovered = covers.filter((id) => mustRequirementIds.includes(id));
            const shouldCovered = covers.filter((id) => shouldRequirementIds.includes(id));
            const gates = input.gatesByLibraryId.get(candidate.workflowLibraryId);

            return {
                workflowLibraryId: candidate.workflowLibraryId,
                name: candidate.name,
                role: deriveRole(candidate),
                coversRequirementIds: covers,
                mustRequirementIdsCovered: mustCovered,
                shouldRequirementIdsCovered: shouldCovered,
                selectionReason: `Selected as composition component ${selected.indexOf(candidate) + 1}: adds MUST coverage ${mustCovered.join(', ') || '(none)'} with no intrinsic hard-gate FAIL.`,
                failedGates: [],
                unknownGates: gates ? sortedStrings(gates.gateNamesByStatus.unknown) : []
            };
        });

        // 5. SHOULD + informational coverage across the selected set —
        //    informational only, never a viability gate.
        const coveredAll = new Set<string>();
        for (const component of components) {
            for (const id of component.coversRequirementIds) {
                coveredAll.add(id);
            }
        }

        const shouldCovered = shouldRequirementIds.filter((id) => coveredAll.has(id));
        const shouldUncovered = shouldRequirementIds.filter((id) => !coveredAll.has(id));
        const otherCovered = otherRequirementIds.filter((id) => coveredAll.has(id));
        const otherUncovered = otherRequirementIds.filter((id) => !coveredAll.has(id));
        const uncoveredAll = sortedIds([
            ...uncoveredMust,
            ...shouldUncovered,
            ...otherUncovered
        ]);

        // 6. Compatibility analysis — records unresolved connection work
        //    explicitly; no n8n graph is generated.
        const concerns: string[] = [];
        let reviewRequired = false;

        for (const component of components) {
            if (component.unknownGates.length > 0) {
                reviewRequired = true;
                concerns.push(
                    `${component.workflowLibraryId}: gate(s) UNKNOWN — ${component.unknownGates.join(', ')}; human review required before the composition is consumable.`
                );
            }
        }

        if (components.length > 1) {
            for (let i = 0; i < components.length - 1; i += 1) {
                for (let j = i + 1; j < components.length; j += 1) {
                    const a = components[i];
                    const b = components[j];
                    const sharedIntegrations = sortedStrings(
                        intersect(input.candidates, a.workflowLibraryId, b.workflowLibraryId, 'integrations')
                    );
                    const sharedTriggers = sortedStrings(
                        intersect(input.candidates, a.workflowLibraryId, b.workflowLibraryId, 'triggers')
                    );

                    if (sharedIntegrations.length === 0 && sharedTriggers.length === 0) {
                        concerns.push(
                            `No observed integration or trigger overlap between ${a.workflowLibraryId} and ${b.workflowLibraryId}; the cross-workflow handoff requires explicit design.`
                        );
                    } else {
                        concerns.push(
                            `Observed overlap between ${a.workflowLibraryId} and ${b.workflowLibraryId} (integrations: ${sharedIntegrations.join(', ') || 'none'}; triggers: ${sharedTriggers.join(', ') || 'none'}); the cross-workflow handoff still requires explicit design.`
                        );
                    }
                }
            }
            reviewRequired = true;
        }

        const plan: CompositionPlan = {
            strategy: 'COMPOSE',
            status: 'VIABLE',
            viable: true,
            components,
            mustRequirementIdsCovered: sortedIds([...coveredMust]),
            shouldRequirementIdsCovered: sortedIds(shouldCovered),
            uncoveredRequirementIds: uncoveredAll,
            uncoveredMustRequirementIds: sortedIds(uncoveredMust),
            uncoveredShouldRequirementIds: sortedIds(shouldUncovered),
            compatibility: { reviewRequired, concerns },
            maxComponents: MAX_COMPOSITION_COMPONENTS,
            reasoning: buildReasoning({
                components,
                mustCovered: sortedIds([...coveredMust]),
                shouldCovered: sortedIds(shouldCovered),
                otherCovered: sortedIds(otherCovered),
                shouldUncovered: sortedIds(shouldUncovered),
                otherUncovered: sortedIds(otherUncovered),
                reviewRequired,
                maxComponents: MAX_COMPOSITION_COMPONENTS
            })
        };

        return plan;
    }

    private notViable(
        input: CompositionPlanInput,
        mustRequirementIds: string[],
        shouldRequirementIds: string[],
        otherRequirementIds: string[],
        uncoveredMust: string[],
        status: CompositionPlanStatus,
        reason: string
    ): CompositionPlan {
        return {
            strategy: 'COMPOSE',
            status,
            viable: false,
            components: [],
            mustRequirementIdsCovered: [],
            shouldRequirementIdsCovered: [],
            uncoveredRequirementIds: sortedIds([...uncoveredMust, ...shouldRequirementIds, ...otherRequirementIds]),
            // Genuinely uncovered MUSTs only — never over-reported.
            uncoveredMustRequirementIds: sortedIds(uncoveredMust),
            uncoveredShouldRequirementIds: sortedIds(shouldRequirementIds),
            compatibility: { reviewRequired: false, concerns: [] },
            maxComponents: MAX_COMPOSITION_COMPONENTS,
            reasoning: reason
        };
    }
}

// ----------------------------------------------------------------------
// Deterministic helpers (no environmental input)
// ----------------------------------------------------------------------

function sortedIds(ids: string[]): string[] {
    return [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function sortedStrings(values: string[]): string[] {
    return sortedIds(values);
}

function sortedById(candidates: CompositionPlannerCandidate[]): CompositionPlannerCandidate[] {
    return [...candidates].sort((a, b) =>
        a.workflowLibraryId < b.workflowLibraryId ? -1 : a.workflowLibraryId > b.workflowLibraryId ? 1 : 0
    );
}

function intersect(
    candidates: CompositionPlannerCandidate[],
    idA: string,
    idB: string,
    field: 'integrations' | 'triggers'
): string[] {
    const normalize = (values: string[]) =>
        new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));

    const a = candidates.find((candidate) => candidate.workflowLibraryId === idA);
    const b = candidates.find((candidate) => candidate.workflowLibraryId === idB);

    if (!a || !b) {
        return [];
    }

    const setB = normalize(b[field]);
    return [...normalize(a[field])].filter((value) => setB.has(value));
}

/**
 * Deterministic descriptive role from observed metadata only (same
 * vocabulary as the phase-8 prototype; never a capability claim).
 */
function deriveRole(candidate: CompositionPlannerCandidate): string {
    const triggers = candidate.triggers.map((trigger) => trigger.trim().toLowerCase());

    if (triggers.includes('webhook')) {
        return 'Ingestion';
    }

    const integrations = candidate.integrations.map((item) => item.trim().toLowerCase());

    if (integrations.some((item) => item.includes('crm'))) {
        return 'Processing';
    }

    return 'Utility';
}

function buildReasoning(args: {
    components: CompositionPlanComponent[];
    mustCovered: string[];
    shouldCovered: string[];
    otherCovered: string[];
    shouldUncovered: string[];
    otherUncovered: string[];
    reviewRequired: boolean;
    maxComponents: number;
}): string {
    const componentSummary = args.components
        .map(
            (component) =>
                `${component.workflowLibraryId} covers [${component.coversRequirementIds.join(', ') || 'none'}]`
        )
        .join('; ');

    const parts: string[] = [
        `Composition of ${args.components.length} component(s) within the documented maximum of ${args.maxComponents}: ${componentSummary}.`,
        `MUST requirements covered: ${args.mustCovered.join(', ') || 'none'}.`
    ];

    parts.push(
        args.shouldUncovered.length === 0
            ? `SHOULD requirements covered: ${args.shouldCovered.join(', ') || 'none'}.`
            : `SHOULD requirements covered: ${args.shouldCovered.join(', ') || 'none'}; uncovered SHOULD requirements are informational only: ${args.shouldUncovered.join(', ')}.`
    );

    if (args.otherUncovered.length > 0) {
        parts.push(`Other informational requirements uncovered: ${args.otherUncovered.join(', ')}.`);
    }

    parts.push(
        args.reviewRequired
            ? 'Human review is required before this composition is consumable (cross-workflow handoff design and/or UNKNOWN gates).'
            : 'No review-required condition was detected for this composition.'
    );

    return parts.join(' ');
}

export const compositionPlanner = new CompositionPlanner();
