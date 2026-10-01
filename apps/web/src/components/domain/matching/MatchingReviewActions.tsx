"use client";

/**
 * @file MatchingReviewActions.tsx
 * @description Review actions (Approve / Reject) for the Matching Review
 * Surface. Presentational/domain-level: it never fetches the session itself
 * — the page supplies the session context and receives success callbacks.
 *
 * Behavior contract (Step 5):
 * - Rendered only while the decision is REVIEW_REQUIRED; the server remains
 *   the authority (UI visibility is convenience only, no role fields).
 * - Confirm-first inline panel for both actions — no modal library.
 * - Reject sends NO body: the backend's optional `reason` is audit-only and
 *   never surfaced in the product, so no reason input is exposed and no
 *   reviewReason field is invented.
 * - BUILD strategy with no primary candidate cannot present Approve as if a
 *   reusable workflow was selected: the approve affordance is withheld and
 *   the panel states what approval would actually mean for this decision.
 * - On 409 (already reviewed), the page is asked to refetch the session so
 *   the UI reflects server truth; the error is still displayed.
 */

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchingApi } from '@/lib/matching-api';

export type MatchingReviewActionKind = 'APPROVED' | 'REJECTED';

export interface MatchingReviewActionsProps {
  sessionId: string;
  decisionStatus: string;
  /** Persisted strategy (e.g. REUSE | BUILD) — drives BUILD/no-candidate copy. */
  strategy: string | null;
  /** True when the blueprint names a primary candidate workflow. */
  hasPrimaryCandidate: boolean;
  /** Called after a successful approve; the page refetches session detail. */
  onApproved: () => void;
  /** Called after a successful reject; the page refetches session detail. */
  onRejected: () => void;
  /** Called on 409/already-reviewed so the UI can reflect server truth. */
  onConflict?: () => void;
}

type PendingAction = 'APPROVE' | 'REJECT' | null;
type ConfirmAction = 'APPROVE' | 'REJECT' | null;

/** Human-readable message per backend error code (never raw stacks). */
function reviewErrorMessage(error: { code?: string; message?: string } | undefined): string {
  const code = error?.code ?? '';

  switch (code) {
    case 'MATCHING_REVIEW_ALREADY_DECIDED':
      return 'This session has already been reviewed by another operator. Refreshing its current state.';
    case 'MATCHING_REVIEW_NOT_READY':
      return 'This session is not ready for review yet. Refreshing its current state.';
    case 'MATCHING_REVIEW_SESSION_NOT_FOUND':
    case 'MATCHING_REVIEW_ARCHITECTURE_NOT_FOUND':
      return 'This matching session no longer exists. It may have been removed.';
    case 'MATCHING_REVIEW_USER_REQUIRED':
      return 'You need to be signed in to review this session.';
    case 'NETWORK_ERROR':
      return 'Could not reach the server. Check your connection and try again.';
    case 'FORBIDDEN':
    case 'INSUFFICIENT_PERMISSIONS':
      return 'You do not have permission to review matching decisions.';
    default:
      return error?.message || 'The review action failed. Please try again.';
  }
}

function isConflictError(error: { code?: string; message?: string } | undefined): boolean {
  const code = error?.code ?? '';

  return (
    code === 'MATCHING_REVIEW_ALREADY_DECIDED' || code === 'MATCHING_REVIEW_NOT_READY'
  );
}

export function MatchingReviewActions({
  sessionId,
  decisionStatus,
  strategy,
  hasPrimaryCandidate,
  onApproved,
  onRejected,
  onConflict
}: MatchingReviewActionsProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Actions exist ONLY while a decision is required. The server remains the
  // authority; this visibility is convenience only.
  if (decisionStatus !== 'REVIEW_REQUIRED') {
    return null;
  }

  const isBuildWithoutCandidate = strategy === 'BUILD' && !hasPrimaryCandidate;
  const submitting = pendingAction !== null;

  const submit = async (action: 'APPROVE' | 'REJECT') => {
    setPendingAction(action);
    setActionError(null);

    const { data, error } =
      action === 'APPROVE'
        ? await matchingApi.approveMatch(sessionId)
        : await matchingApi.rejectMatch(sessionId);

    if (error) {
      setActionError(reviewErrorMessage(error));

      if (isConflictError(error)) {
        // Another operator already reviewed (or state moved) — drop the
        // confirmation panel and let the page show the server truth.
        setConfirmAction(null);
        onConflict?.();
      }

      setPendingAction(null);
      return;
    }

    setConfirmAction(null);
    setPendingAction(null);

    if (data?.decision === 'APPROVED') {
      onApproved();
    } else {
      onRejected();
    }
  };

  const cancelConfirm = () => {
    if (submitting) return;
    setConfirmAction(null);
    setActionError(null);
  };

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Review Decision</h3>
          <p className="text-sm text-gray-500 mt-1">
            {isBuildWithoutCandidate
              ? 'No reusable workflow was selected — approval records this BUILD session as reviewed without advancing a workflow choice.'
              : !hasPrimaryCandidate
                ? 'No reusable workflow was selected for this session.'
                : 'Approve to record this matching decision, or reject it if the recommendation does not fit.'}
          </p>
        </div>

        {confirmAction === null ? (
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setConfirmAction('APPROVE');
              }}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setConfirmAction('REJECT');
              }}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        ) : null}
      </div>

      {confirmAction !== null && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {confirmAction === 'APPROVE'
                  ? 'Approve this matching decision?'
                  : 'Reject this matching decision?'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {confirmAction === 'APPROVE'
                  ? hasPrimaryCandidate
                    ? 'Approval advances this matching decision and marks the recommended workflow as selected.'
                    : isBuildWithoutCandidate
                      ? 'This session has no selected workflow to advance. Approval confirms the BUILD decision was reviewed; the follow-up build is handled separately.'
                      : 'No reusable workflow was selected for this session. Approval records the matching decision as reviewed.'
                  : 'Rejection closes this matching session without selecting a workflow. This cannot be undone.'}
              </p>

              {actionError && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => submit(confirmAction)}
                  disabled={submitting}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed',
                    confirmAction === 'APPROVE'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  )}
                >
                  {submitting
                    ? 'Submitting...'
                    : confirmAction === 'APPROVE'
                      ? 'Confirm approve'
                      : 'Confirm reject'}
                </button>
                <button
                  type="button"
                  onClick={cancelConfirm}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
