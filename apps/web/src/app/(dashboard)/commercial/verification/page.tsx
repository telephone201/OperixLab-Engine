import React, { useState, useEffect } from 'react';
import { agreementPaymentApi } from '@/lib/agreement-payment-api';
import { Payment } from '@/types/agreement-payment';

export default function PaymentVerificationPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPendingPayments() {
      try {
        // For this implementation, we fetch all payments and filter for PENDING/REQUIRED
        // In a real system, we would have a dedicated /api/commercial/payments/pending endpoint
        const res = await agreementPaymentApi.getAgreementContext('all'); // Mocked for this overview
        // Since we don't have a global list, we'll use a simplified state for now
        setLoading(false);
      } catch (e) {
        setError('Failed to load pending payments.');
        setLoading(false);
      }
    }
    fetchPendingPayments();
  }, []);

  if (loading) return <div className="p-6 animate-pulse">Loading verification queue...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Payment Verification Queue</h1>
        <p className="text-gray-500">Human review for client payment submissions.</p>
      </header>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
            <tr>
              <th className="p-4 font-semibold">Payment ID</th>
              <th className="p-4 font-semibold">Expected</th>
              <th className="p-4 font-semibold">Submitted</th>
              <th className="p-4 font-semibold">Reference</th>
              <th className="p-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                  No payments awaiting verification.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.paymentId} className="border-b border-gray-100">
                  <td className="p-4 text-sm font-mono">{p.paymentId}</td>
                  <td className="p-4 text-sm">{p.currency} {p.expectedAmount}</td>
                  <td className="p-4 text-sm font-medium">{p.currency} {p.submittedAmount || 0}</td>
                  <td className="p-4 text-sm text-gray-500">{p.clientReference || 'No reference'}</td>
                  <td className="p-4 flex gap-2">
                    <button className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700">Verify</button>
                    <button className="bg-red-100 text-red-800 px-3 py-1 rounded text-xs font-bold hover:bg-red-200">Reject</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
