"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { domainApi } from '@/lib/domain-api';
import { matchingApi, MatchingSessionListItem } from '@/lib/matching-api';
import { MatchingSessionDetail } from '@/types/matching';
import { MatchingSessionHeader } from '@/components/domain/matching/MatchingSessionHeader';
import { MatchingRecommendationCard } from '@/components/domain/matching/MatchingRecommendationCard';
import { MatchingSelectedWorkflowCard } from '@/components/domain/matching/MatchingSelectedWorkflowCard';
import { MatchingEvidenceTabs } from '@/components/domain/matching/MatchingEvidenceTabs';
import { MatchingReviewActions } from '@/components/domain/matching/MatchingReviewActions';
import { Lead, LeadResearch, LeadQualification, LeadPain, LeadRequirements } from '@/types/domain';
import { EvidenceItem } from '@/components/domain/EvidenceItem';
import { QualScoreCard } from '@/components/domain/QualScoreCard';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'research' | 'qualification' | 'pain' | 'requirements' | 'matching';

export default function LeadDetailPage() {
  const { leadId } = useParams();
  const id = leadId as string;
  const { user } = useAuth();
  const canManageResearch =
    user?.role === 'OWNER' || user?.role === 'OPERATOR';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [researchProvider, setResearchProvider] = useState<'PERPLEXITY' | 'GEMINI'>('PERPLEXITY');
  const [researchTask, setResearchTask] = useState<{
    taskId: string;
    researchRequestId: string;
    provider: 'PERPLEXITY' | 'GEMINI';
    prompt: string;
    status: string;
  } | null>(null);
  const [researchTaskLoading, setResearchTaskLoading] = useState(false);
  const [researchTaskError, setResearchTaskError] = useState<string | null>(null);

  const [lead, setLead] = useState<Lead | null>(null);
  const [research, setResearch] = useState<{ data: LeadResearch | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [qualification, setQualification] = useState<{ data: LeadQualification | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [pain, setPain] = useState<{ data: LeadPain | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [requirements, setRequirements] = useState<{ data: LeadRequirements | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Matching Review Surface (lazy: fetched only while the tab is active).
  const [matchingSessions, setMatchingSessions] = useState<MatchingSessionListItem[] | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [matchingDetail, setMatchingDetail] = useState<MatchingSessionDetail | null>(null);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);

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

  const createResearchTask = async () => {
    setResearchTaskLoading(true);
    setResearchTaskError(null);

    try {
      const { data, error } = await domainApi.createResearchTask(
        id,
        researchProvider
      );

      if (error) {
        setResearchTaskError(error.message || 'Failed to create research task.');
        return;
      }

      setResearchTask(data);
    } catch {
      setResearchTaskError('Failed to create research task.');
    } finally {
      setResearchTaskLoading(false);
    }
  };

  const refreshTab = async (tab: Tab) => {
    if (tab === 'research') {
      setResearch(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadResearch(id);
      setResearch({ data, loading: false, error: error?.code === 'RESOURCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : error?.message || null });
    } else if (tab === 'qualification') {
      setQualification(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadQualification(id);
      setQualification({ data, loading: false, error: error?.code === 'RESOURCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : error?.message || null });
    } else if (tab === 'pain') {
      setPain(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadPain(id);
      setPain({ data, loading: false, error: error?.code === 'RESOURCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : error?.message || null });
    } else if (tab === 'requirements') {
      setRequirements(prev => ({ ...prev, loading: true, error: null }));
      const { data, error } = await domainApi.getLeadRequirements(id);
      setRequirements({ data, loading: false, error: error?.code === 'RESOURCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : error?.message || null });
    } else if (tab === 'matching') {
      // Matching sessions: list first, then the most recently updated
      // session's detail. Lazy — runs only while the tab is active.
      setMatchingLoading(true);
      setMatchingError(null);
      try {
        const { data: sessions, error: listError } = await matchingApi.getLeadMatchingSessions(id);

        if (listError) {
          setMatchingError(listError.message || 'Failed to load matching sessions.');
          return;
        }

        const sessionList = sessions ?? [];
        setMatchingSessions(sessionList);

        if (sessionList.length === 0) {
          setMatchingDetail(null);
          setSelectedSessionId(null);
          return;
        }

        const preferred =
          selectedSessionId &&
          sessionList.some((session) => session.sessionId === selectedSessionId)
            ? selectedSessionId
            : [...sessionList].sort(
                (a, b) =>
                  (b.decision.updatedAt?.getTime() ?? 0) -
                  (a.decision.updatedAt?.getTime() ?? 0)
              )[0].sessionId;

        setSelectedSessionId(preferred);

        const { data: detail, error: detailError } =
          await matchingApi.getMatchingSessionDetail(id, preferred);

        if (detailError) {
          setMatchingError(
            detailError.message || 'Failed to load the matching session detail.'
          );
          return;
        }

        setMatchingDetail(detail);
      } catch {
        setMatchingError('Failed to load matching data.');
      } finally {
        setMatchingLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshTab(activeTab);
  }, [activeTab, id]);

  /**
   * Refetch the CURRENT session's detail explicitly by sessionId — not via
   * refreshTab('matching'), whose closure can capture a stale selectedSessionId
   * (the session pills set state and then call refreshTab in the same tick).
   * Runs after approve/reject and on 409 so the UI reflects server truth;
   * the actions disappear naturally once status leaves REVIEW_REQUIRED.
   */
  const refetchMatchingDetail = async (sessionId: string) => {
    setMatchingLoading(true);
    setMatchingError(null);
    try {
      const { data: detail, error } = await matchingApi.getMatchingSessionDetail(
        id,
        sessionId
      );

      if (error) {
        setMatchingError(
          error.message || 'Failed to load the matching session detail.'
        );
        return;
      }

      setMatchingDetail(detail);
    } catch {
      setMatchingError('Failed to load matching data.');
    } finally {
      setMatchingLoading(false);
    }
  };

  /**
   * Session selection: refetch the clicked session's detail explicitly.
   * Selection must NOT route through refreshTab('matching') — its closure
   * captures a stale selectedSessionId, so the preference logic would fetch
   * (and reset selection to) the previously selected session instead of the
   * clicked pill.
   */
  const selectMatchingSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    await refetchMatchingDetail(sessionId);
  };

  if (globalLoading) return <div className="p-6 animate-pulse">Loading lead workspace...</div>;
  if (globalError) return <div className="p-6 text-red-600 font-bold">Error: {globalError}</div>;
  if (!lead) return <div className="p-6 text-gray-500">Lead not found.</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'research', label: 'Research' },
    { id: 'qualification', label: 'Qualification' },
    { id: 'pain', label: 'Pain' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'matching', label: 'Matching' },
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
            {canManageResearch && (
              <div className="mb-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Start AI Research
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Generate a research task and a copy-ready prompt for manual AI research.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={researchProvider}
                      onChange={(event) =>
                        setResearchProvider(
                          event.target.value as 'PERPLEXITY' | 'GEMINI'
                        )
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                      disabled={researchTaskLoading}
                    >
                      <option value="PERPLEXITY">Perplexity</option>
                      <option value="GEMINI">Gemini</option>
                    </select>

                    <button
                      onClick={createResearchTask}
                      disabled={researchTaskLoading}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {researchTaskLoading
                        ? 'Creating...'
                        : 'Create Research Task'}
                    </button>
                  </div>
                </div>

                {researchTaskError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {researchTaskError}
                  </div>
                )}

                {researchTask && (
                  <div className="mt-5 p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                      <span>
                        Provider:{' '}
                        <strong className="text-gray-900">
                          {researchTask.provider}
                        </strong>
                      </span>
                      <span>
                        Status:{' '}
                        <strong className="text-gray-900">
                          {researchTask.status}
                        </strong>
                      </span>
                      <span>
                        Task:{' '}
                        <strong className="text-gray-900">
                          {researchTask.taskId}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h4 className="text-sm font-bold text-gray-800">
                        Generated Prompt
                      </h4>

                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(researchTask.prompt)
                        }
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Copy Prompt
                      </button>
                    </div>

                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-4 max-h-96 overflow-auto">
                      {researchTask.prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}

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
        {activeTab === 'matching' && (
          <div className="space-y-6">
            {/* Session selector — rendered only when multiple sessions exist. */}
            {matchingSessions && matchingSessions.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase">
                  Sessions
                </span>
                {matchingSessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => selectMatchingSession(session.sessionId)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      selectedSessionId === session.sessionId
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {session.sessionId.slice(0, 8)} · {session.decision.strategy ?? 'PENDING'} ·{' '}
                    {session.decision.status}
                    </button>
                  ))}
              </div>
            )}

            {matchingLoading && (
              <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            )}

            {!matchingLoading && matchingError && (
              <div className="text-center py-12 text-gray-500 italic">
                {matchingError}
              </div>
            )}

            {!matchingLoading && !matchingError && matchingSessions && matchingSessions.length === 0 && (
              <div className="text-center py-12 text-gray-500 italic">
                No matching sessions have been created for this lead yet.
              </div>
            )}

            {!matchingLoading && !matchingError && matchingDetail && (
              <>
                <MatchingSessionHeader
                  sessionId={matchingDetail.sessionId}
                  decision={matchingDetail.decision}
                  architecture={matchingDetail.architecture}
                  review={matchingDetail.review}
                />

                <MatchingRecommendationCard
                  recommendation={matchingDetail.recommendation}
                  rejectedStrategies={
                    (matchingDetail.architecture?.blueprint?.rejectedStrategies as
                      | { strategy: string; reason: string }[]
                      | undefined) ?? []
                  }
                />

                <MatchingSelectedWorkflowCard
                  workflow={
                    matchingDetail.candidates.find(
                      (candidate) =>
                        candidate.workflowId === matchingDetail.recommendation.primaryCandidateId
                    )?.workflow ?? null
                  }
                />

                <MatchingEvidenceTabs
                  candidates={matchingDetail.candidates}
                  requirements={matchingDetail.requirements}
                  primaryCandidateId={matchingDetail.recommendation.primaryCandidateId}
                />

                {canManageResearch && (
                  <MatchingReviewActions
                    sessionId={matchingDetail.sessionId}
                    decisionStatus={matchingDetail.decision.status}
                    strategy={matchingDetail.decision.strategy}
                    hasPrimaryCandidate={Boolean(
                      matchingDetail.recommendation.primaryCandidateId
                    )}
                    onApproved={() => refetchMatchingDetail(matchingDetail.sessionId)}
                    onRejected={() => refetchMatchingDetail(matchingDetail.sessionId)}
                    onConflict={() => refetchMatchingDetail(matchingDetail.sessionId)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}





