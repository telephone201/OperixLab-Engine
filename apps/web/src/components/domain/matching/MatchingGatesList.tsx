import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchingGateResult } from '@/types/matching';
import { gateLabel, gateResultStyle } from './shared';

interface MatchingGatesListProps {
  /** Gate rows for the SELECTED candidate. */
  gates: MatchingGateResult[];
}

const RESULT_ICONS: Record<string, JSX.Element> = {
  PASS: <CheckCircle2 className="w-3.5 h-3.5" />,
  FAIL: <XCircle className="w-3.5 h-3.5" />,
  UNKNOWN: <HelpCircle className="w-3.5 h-3.5" />
};

export function MatchingGatesList({ gates }: MatchingGatesListProps) {
  if (gates.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400 italic">
        No compatibility checks were recorded for the selected workflow.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gates.map((gate, index) => {
        const isUnknown = gate.result !== 'PASS' && gate.result !== 'FAIL';

        return (
          <div
            key={`${gate.gateType}-${index}`}
            className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="text-sm font-bold text-gray-900">
                {gateLabel(gate.gateType)}
              </div>

              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0',
                  gateResultStyle(gate.result)
                )}
              >
                {/* UNKNOWN stays UNKNOWN — SECURITY/LICENSE UNKNOWN means
                    "needs human review", never "failed". */}
                {isUnknown ? (
                  gate.result === 'UNKNOWN' ? (
                    <HelpCircle className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )
                ) : gate.result === 'PASS' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {isUnknown && gate.result === 'UNKNOWN'
                  ? 'NEEDS REVIEW'
                  : gate.result}
              </span>
            </div>

            {gate.details && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                {gate.details}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
