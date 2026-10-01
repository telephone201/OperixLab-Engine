"use client";

import React, { useEffect, useState } from 'react';
import { agreementPaymentApi } from '@/lib/agreement-payment-api';
import { Payment } from '@/types/agreement-payment';
import { useAuth } from '@/hooks/use-auth';

type ReviewAction =
  | { type: 'VERIFY'; payment: Payment }
  | { type: 'REJECT'; payment: Payment }
  | null;

export default function PaymentVerificationPage() {
  const { user, isAuthenticated } = useAuth();
  const canManagePayments = user?.role === 'OWNER' || user?.role === 'OPERATOR';

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction>(null);
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchPendingPayments() {
    try {
      setError(null);

      const res = await agreementPaymentApi.getPendingPaymentReviews();

      if (res.error) {
        setError(res.error.message);
        return;
      }

      setPayments(res.data || []);
    } catch {
      setError('Failed to load pending payments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  function openVerify(payment: Payment) {
    setAction({ type: 'VERIFY', payment });
    setVerifiedAmount(String(payment.submittedAmount ?? payment.expectedAmount));
    setReason('');
    setActionError(null);
  }

  function openReject(payment: Payment) {
    setAction({ type: 'REJECT', payment });
    setVerifiedAmount('0');
    setReason('');
    setActionError(null);
  }

  function closeAction() {
    if (submitting) return;

    setAction(null);
    setVerifiedAmount('');
    setReason('');
    setActionError(null);
  }

  async function submitReview() {
    if (!action || !user) return;

    const amount = Number(verifiedAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      setActionError('Enter a valid verified amount.');
      return;
    }

    if (action.type === 'REJECT' && !reason.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const res = await agreementPaymentApi.verifyPayment({
        paymentId: action.payment.paymentId,
        verifiedAmount: amount,
        verifiedBy: user.id,
        decision: action.type === 'VERIFY' ? 'VERIFY' : 'REJECT',
        reason: reason.trim() || undefined,
      });

      if (res.error) {
        setActionError(res.error.message);
        return;
      }

      closeAction();
      setLoading(true);
      await fetchPendingPayments();
    } catch {
      setActionError('Payment verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        Loading verification queue...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">
        {error}
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-red-600">
        Authentication is required to review payments.
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">
          Payment Verification Queue
        </h1>
        <p className="text-gray-500">
          Human review for client payment submissions.
        </p>
      </header>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
            <tr>
              <th className="p-4 font-semibold">Payment ID</th>
              <th className="p-4 font-semibold">Expected</th>
              <th className="p-4 font-semibold">Submitted</th>
              <th className="p-4 font-semibold">Reference</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-gray-500 italic"
                >
                  No payments awaiting verification.
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr
                  key={payment.paymentId}
                  className="border-b border-gray-100"
                >
                  <td className="p-4 text-sm font-mono">
                    {payment.paymentId}
                  </td>

                  <td className="p-4 text-sm">
                    {payment.currency} {payment.expectedAmount}
                  </td>

                  <td className="p-4 text-sm font-medium">
                    {payment.currency} {payment.submittedAmount || 0}
                  </td>

                  <td className="p-4 text-sm text-gray-500">
                    {payment.clientReference || 'No reference'}
                  </td>

                  <td className="p-4 text-sm">
                    {payment.status}
                  </td>

                  <td className="p-4 flex gap-2">
                    {canManagePayments && (
                    <>
                    <button
                      type="button"
                      onClick={() => openVerify(payment)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700"
                    >
                      Verify
                    </button>

                    <button
                      type="button"
                      onClick={() => openReject(payment)}
                      className="bg-red-100 text-red-800 px-3 py-1 rounded text-xs font-bold hover:bg-red-200"
                    >
                      Reject
                    </button>
                    </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {action && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-2">
              {action.type === 'VERIFY'
                ? 'Verify Payment'
                : 'Reject Payment'}
            </h2>

            <p className="text-sm text-gray-500 mb-6">
              Payment: {action.payment.paymentId}
            </p>

            {action.type === 'VERIFY' && (
              <label className="block mb-4">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  Verified Amount ({action.payment.currency})
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={verifiedAmount}
                  onChange={(e) => setVerifiedAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                />
              </label>
            )}

            {action.type === 'REJECT' && (
              <label className="block mb-4">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason
                </span>

                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Explain why the payment was rejected..."
                />
              </label>
            )}

            {actionError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAction}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitReview}
                disabled={submitting}
                className={
                  action.type === 'VERIFY'
                    ? 'px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
                    : 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
                }
              >
                {submitting
                  ? 'Processing...'
                  : action.type === 'VERIFY'
                    ? 'Confirm Verification'
                    : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


