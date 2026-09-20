import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { projectApi } from '@/lib/project-api';
import { Project } from '@/types/project-domain';

type Tab = 'overview' | 'plan' | 'scope' | 'review' | 'handover';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = projectId as string;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [project, setProject] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProject() {
      try {
        const { data, error: apiError } = await projectApi.getProjectDetail(id);
        if (apiError) {
          setError(apiError.message);
        } else {
          setProject(data);
        }
      } catch (e) {
        setError('Failed to load project details.');
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [id]);

  if (loading) return <div className="p-6 animate-pulse">Loading project workspace...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!project) return <div className="p-6 text-gray-500">Project not found.</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'plan', label: 'Delivery Plan' },
    { id: 'scope', label: 'Scope' },
    { id: 'review', label: 'Client Review' },
    { id: 'handover', label: 'Handover' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8 bg-white border border-gray-200 p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{project.project.name}</h1>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                Status: <span className="font-medium text-blue-600 uppercase">{project.project.status}</span>
              </span>
              <span className="flex items-center gap-1">
                Payment: <span className="font-medium">{project.project.paymentStatus}</span>
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                const newState = project.project.status === 'PENDING' ? 'STARTED' : 'IMPLEMENTING';
                await projectApi.transitionProject({ projectId: id, toState: newState, reason: 'Operator transition', actorId: 'operator_1' });
                window.location.reload();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
            >
              Advance State →
            </button>
          </div>
        </div>
      </header>

      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h3 className="text-lg font-bold mb-4">Project Identity</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Project Name</span>
                  <span className="text-sm font-medium">{project.project.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Contract ID</span>
                  <span className="text-sm font-medium">{project.project.contractId}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Start Date</span>
                  <span className="text-sm font-medium">{project.project.startDate ? new Date(project.project.startDate).toLocaleDateString() : 'TBD'}</span>
                </div>
              </div>
            </section>
            <section>
              <h3 className="text-lg font-bold mb-4">Delivery Context</h3>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery Plan:</span>
                  <span className="font-medium">{project.deliveryPlan?.planId || 'Not yet generated'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Scope Baseline:</span>
                  <span className="font-medium">{project.scopeBaseline?.scopeBaselineId || 'Not yet confirmed'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Review Session:</span>
                  <span className="font-medium">{project.reviewSession?.reviewSessionId || 'Not started'}</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Delivery Plan & Milestones</h3>
            {project.deliveryPlan ? (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <span className="text-xs font-bold text-blue-800 uppercase">Active Plan Version: {project.deliveryPlan.planVersion}</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 border border-gray-200 rounded-lg bg-white">
                    <p className="text-sm text-gray-600 italic">Plan milestones and tasks are fetched via /projects/{id}/plan</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      Refresh Plan Data 🔄
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 italic">No delivery plan has been generated for this project.</div>
            )}
          </div>
        )}

        {activeTab === 'scope' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Scope Baseline & Change Requests</h3>
            {project.scopeBaseline ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-100 rounded-lg">
                  <span className="text-xs font-bold text-green-800 uppercase">Baseline Confirmed: {project.scopeBaseline.status}</span>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg bg-white">
                  <p className="text-sm text-gray-600 italic">Detailed scope items and change requests are fetched via /projects/{id}/scope</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 italic">No scope baseline has been confirmed.</div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Client Review & Acceptance</h3>
            {project.reviewSession ? (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Session: {project.reviewSession.reviewSessionId}</span>
                  <span className="text-xs font-bold uppercase bg-white px-2 py-1 rounded border">{project.reviewSession.status}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 italic">No review session has been initiated.</div>
            )}
          </div>
        )}

        {activeTab === 'handover' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Handover & Completion</h3>
            {project.handover ? (
              <div className="p-4 bg-green-50 border border-green-100 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Handover ID: {project.handover.handoverId}</span>
                  <span className="text-xs font-bold uppercase bg-white px-2 py-1 rounded border">{project.handover.status}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 italic">No handover package has been initiated.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
