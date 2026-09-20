import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { commercialApi } from '@/lib/commercial-api';

export default function CommercialDashboard() {
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPipeline() {
      try {
        const { data, error: apiError } = await commercialApi.getCommercialPipeline();
        if (apiError) {
          setError(apiError.message);
        } else if (data) {
          setPipeline(data);
        }
      } catch (e) {
        setError('An unexpected error occurred while fetching the commercial pipeline.');
      } finally {
        setLoading(false);
      }
    }
    fetchPipeline();
  }, []);

  if (loading) return <div className="p-6 animate-pulse">Loading commercial pipeline...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Commercial Management</h1>
        <p className="text-gray-500">Operational overview of the commercial pipeline.</p>
      </header>

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-sm text-gray-600">
              <th className="p-4 font-semibold">Company</th>
              <th className="p-4 font-semibold">Commercial Status</th>
              <th className="p-4 font-semibold">Last Updated</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {pipeline.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">No commercial packages found.</td>
              </tr>
            ) : (
              pipeline.map((item) => (
                <tr key={item.commercialPackageId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm font-medium">{item.companyName}</td>
                  <td className="p-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/acquisition/${item.leadId}/commercial`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Manage Commercials →
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
