import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { commercialApi } from '@/lib/commercial-api';
import { domainApi } from '@/lib/domain-api';
import { CommercialContext, PricingRecommendation, OfferOption, Proposal } from '@/types/commercial';
import { Lead } from '@/types/domain';

type Tab = 'solution' | 'pricing' | 'offers' | 'proposal';

export default function LeadCommercialWorkspace() {
  const { leadId } = useParams();
  const id = leadId as string;

  const [activeTab, setActiveTab] = useState<Tab>('solution');
  const [lead, setLead] = useState<Lead | null>(null);
  const [context, setContext] = useState<{ data: CommercialContext | null; loading: boolean; error: string | null }>({
    data: null, loading: true, error: null
  });
  const [proposalPreview, setProposalPreview] = useState<{ data: any | null; loading: boolean; error: string | null }>({
    data: null, loading: false, error: null
  });

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const [leadRes, contextRes] = await Promise.all([
          domainApi.getLead(id),
          commercialApi.getLeadCommercialContext(id)
        ]);
        setLead(leadRes.data);
        setContext({ data: contextRes.data, loading: false, error: contextRes.error?.message || null });
      } catch (e) {
        setContext(prev => ({ ...prev, loading: false, error: 'Failed to load commercial context.' }));
      }
    }
    loadWorkspace();
  }, [id]);

  const refreshProposal = async () => {
    setProposalPreview(prev => ({ ...prev, loading: true, error: null }));
    const { data, error } = await commercialApi.getProposalPreview(id);
    setProposalPreview({ data, loading: false, error: error?.message || null });
  };

  useEffect(() => {
    if (activeTab === 'proposal') {
      refreshProposal();
    }
  }, [activeTab, id]);

  if (context.loading) return <div className="p-6 animate-pulse">Loading commercial workspace...</div>;
  if (context.error) return <div className="p-6 text-red-600">{context.error}</div>;
  if (!lead || !context.data) return <div className="p-6 text-gray-500">Commercial data not found for this lead.</div>;

  const { package: pkg, pricing, offers, proposal } = context.data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8 bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{lead.company}</h1>
            <p className="text-gray-500">Commercial Management Workspace</p>
          </div>
          <div className="flex gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 uppercase">
              {pkg.status}
            </span>
          </div>
        </div>
      </header>

      <div className="flex border-b border-gray-200 mb-6">
        {(['solution', 'pricing', 'offers', 'proposal'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium capitalize transition-colors relative ${
              activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[400px]">
        {activeTab === 'solution' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Solution Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="text-xs text-gray-400 uppercase font-bold">Solution Architecture ID</span>
                <p className="text-sm font-medium">{pkg.solution_architecture_id}</p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="text-xs text-gray-400 uppercase font-bold">Solution Version</span>
                <p className="text-sm font-medium">{pkg.solution_version_id}</p>
              </div>
            </div>
            <div className="p-4 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 italic">
              Note: Full architecture details are available in the Solution Design phase.
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-8">
            {!pricing ? (
              <div className="text-center py-12 text-gray-500 italic">Pricing has not been generated yet.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl text-center">
                    <span className="text-xs font-bold text-blue-800 uppercase">Recommended Price</span>
                    <div className="text-4xl font-black text-blue-900">{pricing.currency} {pricing.recommendedPrice}</div>
                  </div>
                  <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center">
                    <span className="text-xs font-bold text-gray-600 uppercase">Target Price</span>
                    <div className="text-2xl font-bold text-gray-900">{pricing.currency} {pricing.targetPrice}</div>
                  </div>
                  <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center">
                    <span className="text-xs font-bold text-gray-600 uppercase">Cost Floor</span>
                    <div className="text-2xl font-bold text-gray-900">{pricing.currency} {pricing.costFloor}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-700">Pricing Logic & Reasoning</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{pricing.reasoning}</p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-700">Assumptions & Risks</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{pricing.assumptions}</p>
                    <p className="text-sm text-red-600 leading-relaxed">{pricing.riskFactors}</p>
                  </div>
                </div>
                <div className="flex justify-end border-t pt-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${pricing.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    Status: {pricing.status}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="space-y-6">
            {!offers || offers.length === 0 ? (
              <div className="text-center py-12 text-gray-500 italic">No offer options have been created.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {offers.map((offer) => (
                  <div key={offer.offerId} className="p-6 border border-gray-200 rounded-xl bg-white shadow-sm hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold text-lg">{offer.name}</h4>
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 uppercase">{offer.status}</span>
                    </div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Setup Fee:</span>
                        <span className="font-medium">{offer.currency} {offer.setupFee}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Recurring Fee:</span>
                        <span className="font-medium">{offer.currency} {offer.recurringFee} / {offer.billingCycle}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Commitment:</span>
                        <span className="font-medium">{offer.minimumCommitmentMonths} Months</span>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 mb-4">
                      {offer.description}
                    </div>
                    <div className="text-xs text-gray-400 italic border-t pt-3">
                      Valid until: {new Date(offer.validUntil).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'proposal' && (
          <div className="space-y-8">
            {!proposal ? (
              <div className="text-center py-12 text-gray-500 italic">No proposal has been generated for this lead.</div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                  <div className="flex gap-4 items-center">
                    <h3 className="text-lg font-bold">Proposal Preview</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${proposal.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {proposal.status}
                    </span>
                  </div>
                  <button
                    onClick={refreshProposal}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Refresh Preview 🔄
                  </button>
                </div>

                {proposalPreview.loading ? (
                  <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
                ) : proposalPreview.error ? (
                  <div className="text-center py-12 text-red-600 italic">{proposalPreview.error}</div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 shadow-inner">
                    {proposalPreview.data && (
                      <div className="max-w-3xl mx-auto space-y-8 text-gray-800">
                        {/* Staleness Warning */}
                        {proposalPreview.data.staleness.isStale && (
                          <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6 text-red-800 text-sm">
                            <div className="flex items-center gap-2 font-bold mb-1">
                              <span>⚠️ Proposal Stale</span>
                            </div>
                            <p>One or more source versions changed after this proposal was generated.</p>
                            <div className="text-xs mt-2 opacity-70">
                              Recommended Action: {proposalPreview.data.staleness.recommendedAction}
                            </div>
                          </div>
                        )}

                        {/* Content Rendering */}
                        <section className="space-y-4">
                          <h4 className="text-xl font-bold border-b pb-2">{proposalPreview.data.content.introduction}</h4>
                          <p className="leading-relaxed">{proposalPreview.data.content.companyUnderstanding}</p>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-lg font-bold">Business Pain & Understanding</h4>
                          <p className="leading-relaxed">{proposalPreview.data.content.painSummary}</p>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-lg font-bold">Recommended Solution</h4>
                          <p className="leading-relaxed">{proposalPreview.data.content.recommendedSolution}</p>
                          <p className="text-sm text-gray-600 italic">{proposalPreview.data.content.solutionExplanation}</p>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-lg font-bold">Scope of Work</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                              <div className="text-xs font-bold text-green-600 uppercase mb-2">Included</div>
                              <ul className="text-xs space-y-1 list-disc pl-4">
                                {proposalPreview.data.content.scope.included.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            </div>
                            <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                              <div className="text-xs font-bold text-yellow-600 uppercase mb-2">Optional</div>
                              <ul className="text-xs space-y-1 list-disc pl-4">
                                {proposalPreview.data.content.scope.optional.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            </div>
                            <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                              <div className="text-xs font-bold text-red-600 uppercase mb-2">Out of Scope</div>
                              <ul className="text-xs space-y-1 list-disc pl-4">
                                {proposalPreview.data.content.scope.outOfScope.map((item, i) => <li key={i}</li>)}
                              </ul>
                            </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-lg font-bold">Commercials</h4>
                          <div className="p-4 bg-white border border-gray-200 rounded-lg">
                            <p className="text-sm leading-relaxed">{proposalPreview.data.content.commercialOptions[0]?.description || 'Pricing options pending.'}</p>
                            <div className="text-xl font-bold text-blue-600 mt-2">
                                {proposalPreview.data.content.commercialOptions[0]?.price || 'TBD'}
                            </div>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-lg font-bold">Next Steps</h4>
                          <p className="text-sm text-gray-600 leading-relaxed">{proposalPreview.data.content.nextSteps}</p>
                        </section>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
