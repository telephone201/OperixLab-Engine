import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { domainApi } from '@/lib/domain-api';
import { Lead, LeadResearch, LeadQualification, LeadPain, LeadRequirements } from '@/types/domain';
import { EvidenceItem } from '@/components/domain/EvidenceItem';
import { QualScoreCard } from '@/components/domain/QualScoreCard';

type Tab = 'overview' | 'research' | 'qualification' | 'pain' | 'requirements';

export default function LeadDetailPage() {
  const { leadId } = useParams();
  const id = leadId as string;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [lead, setLead] = useState<Lead | null>(null);
  const [research, setResearch] = useState<{ data: LeadResearch | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [qualification, setQualification] = useState<{ data: LeadQualification | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [pain, setPain] = useState<{ data: LeadPain | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [requirements, setRequirements] = useState<{ data: LeadRequirements | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLead() {
      try {
        const { data, error } = await domainApi.getLead(id);
        if (error) {
          setGlobalError(error.message);
        } else {
          setLead(data);
        }
      } catch (e) {
        setGlobalError('Failed to load lead information.');
      } finally {
        setGlobalLoading(false);
      }
    }
    loadLead();
  }, [id]);

  const refreshTab = async (tab: Tab) => {
    if (tab === 'research') {
      setResearch(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadResearch(id);
      setResearch({ data, loading: false, error: error?.message || null });
    } else if (tab === 'qualification') {
      setQualification(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadQualification(id);
      setQualification({ data, loading: false, error: error?.message || null });
    } else if (tab === 'pain') {
      setPain(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadPain(id);
      setPain({ data, loading: false, error: error?.message || null });
    } else if (tab === 'requirements') {
      setRequirements(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadRequirements(id);
      setRequirements({ data, loading: false, error: error?.message || null });
    }
  };

  useEffect(() => {
    refreshTab(activeTab);
  }, [activeTab, id]);

  if (globalLoading) return <div className="p-6 animate-pulse">Loading lead workspace...</div>;
  if (globalError) return <div className="p-6 text-red-600 font-bold">Error: {globalError}</div>;
  if (!lead) return <div className="p-6 text-gray-500">Lead not found.</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'research', label: 'Research' },
    { id: 'qualification', label: 'Qualification' },
    { id: 'pain', label: 'Pain' },
    { id: 'requirements', label: 'Requirements' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Lead Header */}
      <header className="mb-8 bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{lead.company}</h1>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span>Contact: <span className="text-gray-900 font-medium">{lead.contact}</span></span>
              <span>Source: <span className="text-gray-900 font-medium">{lead.source}</span></span>
              <span>Created: <span className="text-gray-900 font-medium">{new Date(lead.created_at).toLocaleDateString()}</span></span>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 uppercase">
              {lead.status}
            </span>
            <button
              onClick={() => refreshTab(activeTab)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              title="Refresh Current Tab"
            >
              🔄
            </button>
          </div>
        </div>
      </header>

      {/* Lifecycle Indicator */}
      <div className="mb-8 flex items-center justify-between px-2">
        {tabs.map((tab, idx) => (
          <React.Fragment key={tab.id}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {idx + 1}
              </div>
              <span className="text-[10px] uppercase font-bold mt-1 text-gray-400">{tab.label}</span>
            </div>
            {idx < tabs.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
          </React.Fragment>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h3 className="text-lg font-bold mb-4">Identity</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Company</span>
                  <span className="text-sm font-medium">{lead.company}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Primary Contact</span>
                  <span className="text-sm font-medium">{lead.contact}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Acquisition Source</span>
                  <span className="text-sm font-medium">{lead.source}</span>
                </div>
              </div>
            </section>
            <section>
              <h3 className="text-lg font-bold mb-4">Lifecycle Status</h3>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Current Stage</span>
                  <span className="text-sm font-bold text-blue-600 uppercase">{lead.status}</span>
                </div>
                <div className="text-xs text-gray-400 italic">
                  Lead is currently progressing through the commercialization pipeline.
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'research' && (
          <div>
            {research.loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/4 mb-4" />
                {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-lg" />)}
              </div>
            ) : research.error ? (
              <div className="text-center py-12 text-gray-500 italic">
                {research.error === 'RESOURCE_NOT_FOUND' ? 'Research has not been completed for this lead yet.' : research.error}
              </div>
            ) : (
              <div>
                <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <h3 className="text-sm font-bold text-blue-800 uppercase mb-2">Research Summary</h3>
                  <p className="text-gray-700 leading-relaxed">{research.data?.summary}</p>
                </div>
                <h3 className="text-lg font-bold mb-4">Evidence Provenance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {research.data?.evidence.map((ev, i) => (
                    <EvidenceItem key={i} evidence={ev} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'qualification' && (
          <div>
            {qualification.loading ? (
              <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : qualification.error ? (
              <div className="text-center py-12 text-gray-500 italic">
                {qualification.error === 'RESOURCE_NOT_FOUND' ? 'Qualification is not available yet.' : qualification.error}
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex justify-center">
                  <QualScoreCard qualification={qualification.data!} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section>
                    <h3 className="text-lg font-bold mb-4">Component Breakdown</h3>
                    <div className="space-y-3">
                      {qualification.data?.components.map((comp, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">{comp.name}</span>
                            <span className="font-medium">{comp.score}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-600 h-full transition-all duration-500"
                              style={{ width: `${(comp.score / 100) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-lg font-bold mb-4">Buying Intent</h3>
                    <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center">
                      <div className="text-3xl font-black text-gray-900 mb-1 uppercase">
                        {qualification.data?.intent?.state || 'NO_SIGNAL'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Confidence: {qualification.data?.intent ? `${Math.round(qualification.data.intent.confidence * 100)}%` : 'N/A'}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pain' && (
          <div>
            {pain.loading ? (
              <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : pain.error ? (
              <div className="text-center py-12 text-gray-500 italic">
                {pain.error === 'RESOURCE_NOT_FOUND' ? 'Pain analysis is not available yet.' : pain.error}
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-6">
                    <h3 className="text-lg font-bold">Pain Hierarchy</h3>
                    {pain.data?.pains.map((p, i) => (
                      <div key={i} className={`p-4 border rounded-lg ${p.type === 'PRIMARY' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.type === 'PRIMARY' ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-800'}`}>
                            {p.type} PAIN
                          </span>
                          <span className="text-xs text-gray-400">Certainty: {Math.round(p.certainty * 100)}%</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-2">{p.description}</p>
                        <p className="text-xs text-gray-600 italic">Evidence: {p.evidence}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold">Unresolved Questions</h3>
                    <div className="space-y-2">
                      {pain.data?.unresolvedQuestions.map((q, i) => (
                        <div key={i} className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600 italic">
                          {q}
                        </div>
                      ))}
                      {pain.data?.unresolvedQuestions.length === 0 && <div className="text-sm text-gray-400 italic">None reported.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'requirements' && (
          <div>
            {requirements.loading ? (
              <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : requirements.error ? (
              <div className="text-center py-12 text-gray-500 italic">
                {requirements.error === 'RESOURCE_NOT_FOUND' ? 'Requirements have not been extracted yet.' : requirements.error}
              </div>
            ) : (
              <div className="space-y-8">
                {['MUST', 'SHOULD', 'COULD'].map(priority => (
                  <section key={priority}>
                    <h3 className={`text-sm font-black uppercase mb-4 flex items-center gap-2 ${
                      priority === 'MUST' ? 'text-red-600' : priority === 'SHOULD' ? 'text-yellow-600' : 'text-gray-500'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        priority === 'MUST' ? 'bg-red-600' : priority === 'SHOULD' ? 'bg-yellow-600' : 'bg-gray-500'
                      }`} />
                      {priority} Requirements
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {requirements.data?.requirements.filter(r => r.priority === priority).map((req, i) => (
                        <div key={i} className="p-4 border border-gray-200 rounded-lg bg-white flex justify-between items-center hover:border-blue-200 transition-colors">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm text-gray-800 font-medium">{req.description}</span>
                            <div className="flex gap-3 text-[10px] text-gray-400 uppercase font-bold">
                              <span>Source: {req.source}</span>
                              <span>Confidence: {Math.round(req.confidence * 100)}%</span>
                              <span>Status: {req.status}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {requirements.data?.requirements.filter(r => r.priority === priority).length === 0 && (
                        <div className="text-xs text-gray-400 italic py-2">No {priority.toLowerCase()} requirements identified.</div>
                      )}
                    </div>
                  </section>
                ))}
                <div className="mt-12 p-6 bg-gray-50 border border-gray-200 rounded-xl">
                  <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Requirement Gaps & Questions</h3>
                  <div className="space-y-3">
                    {requirements.data?.unresolvedQuestions.map((q, i) => (
                      <div key={i} className="text-sm text-gray-600 flex gap-3">
                        <span className="text-gray-300">•</span> {q}
                      </div>
                    ))}
                    {requirements.data?.unresolvedQuestions.length === 0 && <div className="text-sm text-gray-400 italic">No remaining gaps.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
