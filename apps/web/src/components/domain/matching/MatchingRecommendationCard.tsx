import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MatchingRecommendation } from '@/types/matching';

interface MatchingRecommendationCardProps {
  recommendation: MatchingRecommendation;
  rejectedStrategies: { strategy: string; reason: string }[];
}

export function MatchingRecommendationCard({
  recommendation,
  rejectedStrategies
}: MatchingRecommendationCardProps) {
  const [showRejected, setShowRejected] = useState(false);

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">
        Why this recommendation
      </h3>

      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
        {recommendation.reasoning ?? 'No recommendation reasoning was recorded.'}
      </p>

      {recommendation.evidence && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">
            Evidence
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {recommendation.evidence}
          </p>
        </div>
      )}

      {rejectedStrategies.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRejected((prev) => !prev)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-800"
          >
            {showRejected ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Why not the other strategies ({rejectedStrategies.length})
          </button>

          {showRejected && (
            <div className="mt-2 space-y-2">
              {rejectedStrategies.map((rejected) => (
                <div
                  key={rejected.strategy}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="text-xs font-bold text-gray-500 uppercase">
                    {rejected.strategy}
                  </div>
                  <p className="text-sm text-gray-700">{rejected.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
