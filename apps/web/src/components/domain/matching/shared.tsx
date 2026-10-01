import { MatchingRequirementContext } from '@/types/matching';

/** Tailwind classes per coverage level. UNKNOWN stays neutral — it is not a
 * failure and must never share FAIL styling. */
export function coverageLevelStyle(level: string): string {
  switch (level) {
    case 'FULL':
      return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'PARTIAL':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
    case 'NONE':
      return 'bg-red-500/10 text-red-600 border-red-500/30';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

/** Tailwind classes per gate result. UNKNOWN stays neutral — SECURITY
 * UNKNOWN in particular means "needs review", not "failed". */
export function gateResultStyle(result: string): string {
  switch (result) {
    case 'PASS':
      return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'FAIL':
      return 'bg-red-500/10 text-red-600 border-red-500/30';
    default:
      return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
  }
}

/** Human label for a gate row, with the review-relevant framing for the
 * gates that currently surface as UNKNOWN by design. */
export function gateLabel(gateType: string): string {
  switch (gateType) {
    case 'MUST_REQUIREMENT_COVERAGE':
      return 'MUST Requirement Coverage';
    case 'TRIGGER_COMPATIBILITY':
      return 'Trigger Compatibility';
    case 'INPUT_COMPATIBILITY':
      return 'Input Compatibility';
    case 'OUTPUT_COMPATIBILITY':
      return 'Output Compatibility';
    case 'INTEGRATION_COMPATIBILITY':
      return 'Integration Compatibility';
    case 'SECURITY':
      return 'Security (needs review)';
    case 'LICENSE':
      return 'License (needs review)';
    default:
      return gateType;
  }
}

/** Requirement display context for a coverage row, from the session-level
 * requirements list. Falls back to null — never fabricated. */
export function resolveRequirementContext(
  requirements: MatchingRequirementContext[],
  requirementId: string
): MatchingRequirementContext | null {
  return (
    requirements.find((requirement) => requirement.id === requirementId) ??
    null
  );
}
