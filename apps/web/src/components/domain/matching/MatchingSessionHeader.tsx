import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MatchingDecision,
  MatchingArchitecture,
  MatchingReview
} from '@/types/matching';

interface MatchingSessionHeaderProps {
  sessionId: string;
  decision: MatchingDecision;
  architecture: MatchingArchitecture | null;
  review: MatchingReview;
}

const DECISION_STYLES: Record<string, { badge: string; icon: JSX.Element }> = {
  REVIEW_REQUIRED: {
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  APPROVED: {
    badge: 'bg-green-500/10 text-green-600 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  REJECTED: {
    badge: 'bg-red-500/10 text-red-600 border-red-500/30',
    icon: <XCircle className="w-4 h-4" />
  }
};

export function MatchingSessionHeader({
  sessionId,
  decision,
  architecture,
  review
}: MatchingSessionHeaderProps) {
  const style =
    DECISION_STYLES[decision.status] ?? {
      badge: 'bg-gray-100 text-gray-600 border-gray-200',
      icon: <Clock className="w-4 h-4" />
    };

  const decidedAt = review.decidedAt ?? null;

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border',
              style.badge
            )}
          >
            {style.icon}
            {decision.status === 'REVIEW_REQUIRED'
              ? 'Awaiting decision'
              : decision.status}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-blue-500/10 text-blue-600 border border-blue-500/30">
            {decision.strategy ?? 'NO STRATEGY'}
          </span>
        </div>

        <div className="text-sm text-gray-500 text-left sm:text-right">
          <div>
            Architecture:{' '}
            <span className="font-medium text-gray-700">
              {architecture ? architecture.status : '—'}
            </span>
          </div>
          {review.decidedBy && (
            <div className="text-xs mt-0.5">
              Decided by{' '}
              <span className="font-medium text-gray-600">
                {review.decidedBy.slice(0, 8)}
              </span>
              {decidedAt && ` · ${decidedAt.toLocaleString()}`}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-0.5 font-mono">
            Session {sessionId.slice(0, 8)}
          </div>
        </div>
      </div>
      {/* overallConfidence is NULL by design — deliberately not rendered. */}
    </div>
  );
}
