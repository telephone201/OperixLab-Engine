"use client";
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { domainApi } from '@/lib/domain-api';
import { Lead } from '@/types/domain';

interface IngestionBatch {
  id: string;
  batch_name: string;
  source: string;
  provider: string;
  status: string;
  total_records: number;
  processed_records: number;
  imported_records: number;
  duplicate_records: number;
  failed_records: number;
  created_at: string;
  review_session_id?: string | null;
  review_session_status?: string | null;
}

export default function AcquisitionPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [batches, setBatches] = useState<IngestionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'leads' | 'batches'>('leads');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Promotion State
  const [promotingBatchId, setPromotingBatchId] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();

  const fetchLeads = async () => {
    try {
      const { data, error: apiError } = await domainApi.getLeads();
      if (apiError) {
        setError(apiError.message);
      } else if (data) {
        setLeads(data);
      }
    } catch {
      setError('An unexpected error occurred while fetching leads.');
    }
  };

  const fetchBatches = async () => {
    try {
      const { data, error: apiError } = await domainApi.getIngestionBatches();
      if (!apiError && data) {
        setBatches(data);
      }
    } catch {
      // Ignore batch fetch error if optional
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      await Promise.all([fetchLeads(), fetchBatches()]);
      setLoading(false);
    }
    loadInitialData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
      setUploadResult(null);
      if (!batchName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setBatchName(nameWithoutExt);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a CSV or Excel file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const { data, error: apiError } = await domainApi.uploadExternalLeads(selectedFile, batchName);

      if (apiError) {
        setUploadError(apiError.message || 'File upload failed. Ensure the file has valid lead headers.');
      } else if (data) {
        setUploadResult(data);
        await Promise.all([fetchBatches(), fetchLeads()]);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Network error during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePromoteBatch = async (batchId: string) => {
    setPromotingBatchId(batchId);
    setActionAlert(null);
    try {
      const { data, error: apiError } = await domainApi.promoteApprovedBatch(batchId);
      if (apiError) {
        setActionAlert({
          type: 'error',
          message: apiError.message || 'Promotion failed. Ensure the mapping review session is APPROVED.'
        });
      } else if (data) {
        setActionAlert({
          type: 'success',
          message: `Successfully promoted ${data.importedCount} leads from approved batch to live pipeline!`
        });
        await Promise.all([fetchBatches(), fetchLeads()]);
      }
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Failed to promote batch.'
      });
    } finally {
      setPromotingBatchId(null);
    }
  };

  const handleApproveSession = async (sessionId: string, batchId: string) => {
    setActionAlert(null);
    try {
      const { error: apiError } = await domainApi.approveReviewSession(sessionId);
      if (apiError) {
        setActionAlert({
          type: 'error',
          message: apiError.message || 'Approval failed. Unresolved columns or sections exist.'
        });
      } else {
        setActionAlert({
          type: 'success',
          message: 'Mapping review session approved! You can now promote this batch to live leads.'
        });
        await fetchBatches();
      }
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Failed to approve session.'
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Acquisition</h1>
        <p className="text-gray-500 mb-6">Lead acquisition and intelligence workspace.</p>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded-lg w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Acquisition</h1>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with Title and Action Button */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acquisition</h1>
          <p className="text-gray-500 text-sm">Lead acquisition, external ingestion staging, and pipeline intelligence.</p>
        </div>
        <button
          onClick={() => {
            setShowUploadModal(true);
            setUploadResult(null);
            setUploadError(null);
            setSelectedFile(null);
            setBatchName('');
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <span>📥</span>
          <span>Upload External Leads (CSV/XLSX)</span>
        </button>
      </header>

      {/* Action / Alert Banner */}
      {actionAlert && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm flex items-center justify-between transition-all ${
            actionAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionAlert.message}</span>
          <button
            onClick={() => setActionAlert(null)}
            className="text-xs text-gray-500 hover:text-gray-800 ml-4 px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs: Live Leads vs Ingestion Batches */}
      <div className="flex items-center gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('leads')}
          className={`pb-3 text-sm font-semibold transition-all relative ${
            activeTab === 'leads'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Live Leads ({leads.length})
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`pb-3 text-sm font-semibold transition-all relative ${
            activeTab === 'batches'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Ingestion Batches ({batches.length})
        </button>
      </div>

      {/* Tab 1: Live Leads Table */}
      {activeTab === 'leads' && (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold text-sm text-gray-600">Company</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Contact</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Source</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Status</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Created</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No leads found in the system. Upload an external CSV/XLSX batch or discover leads to begin.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/acquisition/${lead.id}`)}
                  >
                    <td className="p-4 text-sm font-medium text-gray-900">{lead.company}</td>
                    <td className="p-4 text-sm text-gray-600">{lead.contact}</td>
                    <td className="p-4 text-sm text-gray-500">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                        {lead.source}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/acquisition/${lead.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Pipeline Actions →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Ingestion Batches Table */}
      {activeTab === 'batches' && (
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold text-sm text-gray-600">Batch Name</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Source</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Staged Records</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Duplicates</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Mapping Review</th>
                <th className="p-4 font-semibold text-sm text-gray-600">Live Leads</th>
                <th className="p-4 font-semibold text-sm text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No ingestion batches found. Upload a spreadsheet to populate raw lead staging.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-900">
                      <div>{b.batch_name}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{b.id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                        {b.source} ({b.provider})
                      </span>
                    </td>
                    <td className="p-4 text-sm font-medium text-blue-600">
                      {b.processed_records} / {b.total_records}
                    </td>
                    <td className="p-4 text-sm text-amber-600">
                      {b.duplicate_records}
                    </td>
                    <td className="p-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          b.review_session_status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.review_session_status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.review_session_status || 'DRAFT'}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-semibold text-gray-800">
                      {b.imported_records > 0 ? (
                        <span className="text-emerald-700">✓ {b.imported_records} imported</span>
                      ) : (
                        <span className="text-gray-400">0 promoted</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-right space-x-2">
                      {/* Review Action if not approved */}
                      {b.review_session_id && b.review_session_status !== 'APPROVED' && (
                        <button
                          onClick={() => handleApproveSession(b.review_session_id!, b.id)}
                          className="px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded border border-indigo-200 transition-colors cursor-pointer"
                          title="Approve mapping decisions for this session"
                        >
                          Approve Review
                        </button>
                      )}

                      {/* Promote Action when approved */}
                      {b.review_session_status === 'APPROVED' && b.imported_records === 0 && (
                        <button
                          onClick={() => handlePromoteBatch(b.id)}
                          disabled={promotingBatchId === b.id}
                          className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-colors shadow-sm cursor-pointer disabled:bg-gray-400"
                        >
                          {promotingBatchId === b.id ? 'Promoting...' : 'Promote to Leads'}
                        </button>
                      )}

                      {b.imported_records > 0 && (
                        <span className="text-xs text-gray-400 italic">Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal (Multipart Form Ingestion) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upload External Leads</h3>
                <p className="text-xs text-gray-500">Stage leads into raw storage & trigger mapping review.</p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {/* File Drop / Select Area */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                  Select CSV or Excel File (.csv, .xlsx, .xls)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer transition-colors bg-gray-50 hover:bg-blue-50/30"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="text-2xl mb-1">📄</div>
                  {selectedFile ? (
                    <div className="text-sm font-medium text-blue-700">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">
                      Click to choose or drag & drop spreadsheet file
                    </div>
                  )}
                </div>
              </div>

              {/* Batch Name Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                  Batch Name
                </label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. Q4 Target Accounts"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Error Message */}
              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                  {uploadError}
                </div>
              )}

              {/* Success Result Breakdown */}
              {uploadResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-2">
                  <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>✅</span> Batch Staged Successfully
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-emerald-800">
                    <div>Total Records: <strong className="font-semibold">{uploadResult.batch.totalRecords}</strong></div>
                    <div>Staged Rows: <strong className="font-semibold">{uploadResult.batch.processedRecords}</strong></div>
                    <div>Duplicates Detected: <strong className="font-semibold">{uploadResult.batch.duplicateRecords}</strong></div>
                    <div>Rejected Rows: <strong className="font-semibold">{uploadResult.batch.failedRecords}</strong></div>
                  </div>
                  <div className="text-[11px] text-emerald-700 pt-1 border-t border-emerald-200">
                    Mapping Review Session: <span className="font-mono">{uploadResult.reviewSession.id.slice(0, 8)}...</span> ({uploadResult.reviewSession.status})
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  {uploadResult ? 'Done' : 'Cancel'}
                </button>

                {!uploadResult && (
                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                        <span>Staging Leads...</span>
                      </>
                    ) : (
                      <span>Upload & Stage</span>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
