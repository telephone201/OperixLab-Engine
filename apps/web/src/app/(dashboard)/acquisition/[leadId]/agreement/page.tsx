import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { agreementPaymentApi } from '@/lib/agreement-payment-api';
import { CommercialAgreement, Payment, PaymentDestination, PaymentReadiness } from '@/types/agreement-payment';

export default function AgreementPaymentPage() {
  const { leadId } = useParams();
  const id = leadId as string;

  const [context, setContext] = useState<{
    agreement: CommercialAgreement | null;
    payments: Payment[];
    readiness: PaymentReadiness | null;
    loading: boolean;
    error: string | null
  }>({
    agreement: null, payments: [], readiness: null, loading: true, error: null
  });

  const [destinations, setDestinations] = useState<PaymentDestination[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [ctxRes, destRes] = await Promise.all([
          agreementPaymentApi.getAgreementContext(id),
          agreementPaymentApi.getPaymentDestinations()
        ]);

        if (ctxRes.error) {
          setContext(prev => ({ ...prev, loading: false, error: ctxRes.error.message }));
        } else {
          setContext({
            agreement: ctxRes.data?.agreement || null,
            payments: ctxRes.data?.payments || [],
            readiness: ctxRes.data?.readiness || null,
            loading: false,
            error: null
          });
        }
        setDestinations(destRes.data || []);
      } catch (e) {
        setContext(prev => ({ ...prev, loading: false, error: 'Failed to load agreement and payment data.' }));
      }
    }
    loadData();
  }, [id]);

  if (context.loading) return <div className="p-6 animate-pulse">Loading agreement workspace...</div>;
  if (context.error) return <div className="p-6 text-red-600">{context.error}</div>;
  if (!context.agreement) return <div className="p-6 text-gray-500">No agreement found for this lead.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Agreement & Payment</h1>
            <p className="text-gray-500 text-sm">Finalizing the commercial contract and verifying payments.</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              context.agreement.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {context.agreement.status}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Agreement Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Agreement Details</h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div className="text-gray-500">Agreement ID:</div>
              <div className="font-medium">{context.agreement.agreementId}</div>
              <div className="text-gray-500">Proposal Version:</div>
              <div className="font-medium">{context.agreement.proposalVersionId}</div>
              <div className="text-gray-500">Created Date:</div>
              <div className="font-medium">{new Date(context.agreement.createdAt).toLocaleDateString()}</div>
              <div className="text-gray-500">Status:</div>
              <div className="font-medium uppercase">{context.agreement.status}</div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Payment Instructions (Manual InstaPay)</h3>
            <div className="space-y-4">
              {destinations.map((dest, i) => (
                <div key={i} className="p-4 border border-gray-200 rounded-lg bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase">Account</div>
                    <div className="font-mono text-sm font-bold">{dest.identifier}</div>
                    <div className="text-xs text-gray-500 italic mt-1">{dest.instructions}</div>
                  </div>
                  <a
                    href={dest.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    Pay Now ↗
                  </a>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700 italic">
              Note: Payment is only marked as VERIFIED after human review of the payment reference.
            </div>
          </section>
        </div>

        {/* Right Column: Payment Status & Readiness */}
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Payment Status</h3>
            <div className="space-y-4">
              {context.payments.length === 0 ? (
                <div className="text-sm text-gray-500 italic">No payments recorded yet.</div>
              ) : (
                context.payments.map((p, i) => (
                  <div key={i} className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-600 uppercase">{p.purpose}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        p.status === 'VERIFIED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expected:</span>
                      <span className="font-medium">{p.currency} {p.expectedAmount}</span>
                    </div>
                    {p.submittedAmount && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Submitted:</span>
                        <span className="font-medium">{p.currency} {p.submittedAmount}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Project Start Eligibility</h3>
            {context.readiness ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Payment Verified</span>
                  <span className={`text-sm font-bold ${context.readiness.status === 'VERIFIED' ? 'text-green-600' : 'text-red-600'}`}>
                    {context.readiness.status === 'VERIFIED' ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Agreement Accepted</span>
                  <span className={`text-sm font-bold ${context.agreement.status === 'ACCEPTED' ? 'text-green-600' : 'text-red-600'}`}>
                    {context.agreement.status === 'ACCEPTED' ? '✓' : '✗'}
                  </span>
                </div>
                <div className={`mt-4 p-3 rounded-lg text-center font-bold text-sm ${
                  context.readiness.status === 'VERIFIED' && context.agreement.status === 'ACCEPTED'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {context.readiness.status === 'VERIFIED' && context.agreement.status === 'ACCEPTED'
                    ? 'PROJECT READY TO START'
                    : 'PROJECT START BLOCKED'}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">Eligibility data unavailable.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
