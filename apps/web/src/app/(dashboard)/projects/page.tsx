import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectApi } from '@/lib/project-api';
import { Project } from '@/types/project-domain';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const { data, error: apiError } = await projectApi.getProjects();
        if (apiError) {
          setError(apiError.message);
        } else if (data) {
          setProjects(data);
        }
      } catch (e) {
        setError('An unexpected error occurred while fetching projects.');
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  if (loading) return <div className="p-6 animate-pulse">Loading projects dashboard...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Project Delivery Dashboard</h1>
        <p className="text-gray-500">Overview of all active delivery engagements.</p>
      </header>

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
            <tr>
              <th className="p-4 font-semibold">Project Name</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Payment</th>
              <th className="p-4 font-semibold">Start Date</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">No projects currently in delivery.</td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm font-medium">{p.name}</td>
                  <td className="p-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 uppercase">
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.paymentStatus === 'VERIFIED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">
                    {p.startDate ? new Date(p.startDate).toLocaleDateString() : 'Not started'}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Manage Project →
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
