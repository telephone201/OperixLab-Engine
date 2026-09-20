import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { domainApi } from '@/lib/domain-api';
import { Lead } from '@/types/domain';

export default function AcquisitionPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeads() {
      try {
        const { data, error: apiError } = await domainApi.getLeads();
        if (apiError) {
          setError(apiError.message);
        } else if (data) {
          setLeads(data);
        }
      } catch (e) {
        setError('An unexpected error occurred while fetching leads.');
      } finally {
        setLoading(false);
      }
    }
    fetchLeads();
  }, []);

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
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Acquisition</h1>
        <p className="text-gray-500">Lead acquisition and intelligence workspace.</p>
      </header>

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
                  No leads found in the system.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/acquisition/${lead.id}`}>
                  <td className="p-4 text-sm font-medium">{lead.company}</td>
                  <td className="p-4 text-sm text-gray-600">{lead.contact}</td>
                  <td className="p-4 text-sm text-gray-500">{lead.source}</td>
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
                      View Details →
                    </Link>
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
