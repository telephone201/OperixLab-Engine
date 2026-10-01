import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  MatchingCandidateDetail,
  MatchingRequirementCoverage,
  MatchingGateResult,
  MatchingRequirementContext
} from '@/types/matching';
import { MatchingCoverageList } from './MatchingCoverageList';
import { MatchingGatesList } from './MatchingGatesList';
import { coverageLevelStyle, gateResultStyle } from './shared';

interface MatchingEvidenceTabsProps {
  candidates: MatchingCandidateDetail[];
  requirements: MatchingRequirementContext[];
  /** workflowId of the SELECTED candidate (recommendation.primaryCandidateId). */
  primaryCandidateId: string | null;
}

type EvidenceTab = 'coverage' | 'gates' | 'candidates';

const TABS: { id: EvidenceTab; label: string }[] = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'gates', label: 'Compatibility Gates' },
  { id: 'candidates', label: 'All Candidates' }
];

export function MatchingEvidenceTabs({
  candidates,
  requirements,
  primaryCandidateId
}: MatchingEvidenceTabsProps) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>('coverage');

  const selectedCandidate =
    candidates.find(
      (candidate) => candidate.workflowId === primaryCandidateId
    ) ?? null;

  const selectedCoverage: MatchingRequirementCoverage[] =
    selectedCandidate?.coverage ?? [];
  const selectedGates: MatchingGateResult[] = selectedCandidate?.gates ?? [];

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'coverage' && (
        <MatchingCoverageList
          coverage={selectedCoverage}
          requirements={requirements}
        />
      )}

      {activeTab === 'gates' && <MatchingGatesList gates={selectedGates} />}

      {activeTab === 'candidates' && (
        /* All candidates view — inline (no seventh component): the full
           candidate set with the selected one first, evidence stays in the
           dedicated tabs above. Horizontal scroll where a table needs it. */
        candidates.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400 italic">
            No workflow candidates were produced for this session.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase font-bold text-gray-400">
                  <th className="py-2 pr-4">Rank</th>
                  <th className="py-2 pr-4">Workflow</th>
                  <th className="py-2 pr-4">Match</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {[...candidates]
                  .sort((a, b) => {
                    if (a.workflowId === primaryCandidateId) return -1;
                    if (b.workflowId === primaryCandidateId) return 1;
                    return (a.rank ?? 999) - (b.rank ?? 999);
                  })
                  .map((candidate) => (
                    <tr
                      key={candidate.id}
                      className={cn(
                        'border-t border-gray-100 align-top',
                        candidate.workflowId === primaryCandidateId &&
                          'bg-blue-50/50'
                      )}
                    >
                      <td className="py-2 pr-4 text-gray-500">
                        {candidate.rank ?? '—'}
                      </td>
                      <td className="py-2 pr-4 font-medium text-gray-800">
                        {candidate.workflow?.name ?? '—'}
                        {candidate.workflowId === primaryCandidateId && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600 text-white">
                            Selected
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {candidate.matchScore == null
                          ? '—'
                          : candidate.matchScore.toFixed(3)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold border',
                            candidate.status === 'SELECTED'
                              ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                              : gateResultStyle('UNKNOWN')
                          )}
                        >
                          {candidate.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500 text-xs max-w-xs">
                        {candidate.reasoning ?? '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
