import React from 'react';
import { CheckCircle2, HelpCircle, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchingRequirementCoverage, MatchingRequirementContext } from '@/types/matching';
import { coverageLevelStyle, resolveRequirementContext } from './shared';

interface MatchingCoverageListProps {
  /** Coverage rows for the SELECTED candidate. */
  coverage: MatchingRequirementCoverage[];
  /** Session-level requirement context for titles/priorities. */
  requirements: MatchingRequirementContext[];
}

const LEVEL_ICONS: Record<string, JSX.Element> = {
  FULL: <CheckCircle2 className="w-3.5 h-3.5" />,
  PARTIAL: <MinusCircle className="w-3.5 h-3.5" />,
  NONE: <XCircle className="w-3.5 h-3.5" />,
  UNKNOWN: <HelpCircle className="w-3.5 h-3.5" />
};

export function MatchingCoverageList({
  coverage,
  requirements
}: MatchingCoverageListProps) {
  if (coverage.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400 italic">
        No coverage evidence was recorded for the selected workflow.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {coverage.map((row) => {
        const context = resolveRequirementContext(requirements, row.requirementId);
        const priority = context?.priority ?? null;

        return (
          <div
            key={row.requirementId}
            className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">
                  {context?.title ?? 'Requirement'}
                </div>

                {/* Priority is informational only (Option A): MUST is the
                    authoritative marker; SHOULD/COULD/UNKNOWN render as a
                    neutral informational chip with no gating implication. */}
                {priority && (
                  <span
                    className={cn(
                      'inline-block mt-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold border',
                      priority === 'MUST'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200'
                    )}
                  >
                    {priority === 'MUST'
                      ? 'MUST'
                      : `${priority} · informational`}
                  </span>
                )}
              </div>

              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0',
                  coverageLevelStyle(row.coverageLevel)
                )}
              >
                {LEVEL_ICONS[row.coverageLevel]}
                {row.coverageLevel}
              </span>
            </div>

            {row.evidence && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                {row.evidence}
              </p>
            )}

            {row.confidence != null && (
              <div className="text-xs text-gray-400 mt-1">
                Confidence: {Math.round(row.confidence * 100)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
