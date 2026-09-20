import React from 'react';
import { ResearchEvidence } from '@/types/domain';

interface EvidenceItemProps {
  evidence: ResearchEvidence;
}

export function EvidenceItem({ evidence }: EvidenceItemProps) {
  const statusColors = {
    OBSERVED: 'bg-green-100 text-green-800 border-green-200',
    INFERRED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    UNKNOWN: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <div className="p-3 border border-gray-200 rounded-lg bg-white shadow-sm mb-3">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusColors[evidence.truth_status]}`}>
          {evidence.truth_status}
        </span>
        <span className="text-xs text-gray-400">Confidence: {Math.round(evidence.confidence * 100)}%</span>
      </div>
      <p className="text-sm text-gray-800 mb-2">{evidence.claim}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 italic">Source: {evidence.source}</span>
        {evidence.url && (
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Source Link ↗
          </a>
        )}
      </div>
    </div>
  );
}
