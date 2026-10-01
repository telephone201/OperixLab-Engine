import React from 'react';
import { Plug, Zap } from 'lucide-react';
import { MatchingCandidateWorkflow } from '@/types/matching';

interface MatchingSelectedWorkflowCardProps {
  workflow: MatchingCandidateWorkflow | null;
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
        {label === 'Integrations' ? (
          <Plug className="w-3.5 h-3.5" />
        ) : (
          <Zap className="w-3.5 h-3.5" />
        )}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MatchingSelectedWorkflowCard({
  workflow
}: MatchingSelectedWorkflowCardProps) {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">
        Selected workflow
      </h3>

      {!workflow ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500 italic">
            No single workflow was selected for this session.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            See the recommendation summary for how the session concluded.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <div className="text-lg font-bold text-gray-900">
                {workflow.name ?? 'Unnamed workflow'}
              </div>
              {workflow.category && (
                <div className="text-xs text-gray-500 uppercase font-medium mt-0.5">
                  {workflow.category}
                </div>
              )}
            </div>
            {workflow.qualityScore != null && (
              <div className="text-right shrink-0">
                <div className="text-2xl font-black text-gray-800">
                  {workflow.qualityScore}
                </div>
                <div className="text-[10px] uppercase font-bold text-gray-400">
                  Quality
                </div>
              </div>
            )}
          </div>

          {workflow.description && (
            <p className="text-sm text-gray-700 leading-relaxed">
              {workflow.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <TagList label="Integrations" items={workflow.integrations} />
            <TagList label="Triggers" items={workflow.triggers} />
          </div>
        </div>
      )}
      {/* workflow is null only when the library row is genuinely missing —
          no metadata is ever fabricated here. */}
    </div>
  );
}
