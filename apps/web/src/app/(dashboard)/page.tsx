import React from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Operational Overview</h1>
                <p className="text-operix-muted">Welcome back, Operator. Here is the current state of the pipeline.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard
                    title="New Leads"
                    value="0"
                    status="PENDING"
                    description="Awaiting acquisition"
                />
                <DashboardCard
                    title="Research Pending"
                    value="0"
                    status="PENDING"
                    description="Needs enrichment"
                />
                <DashboardCard
                    title="Proposals Pending"
                    value="0"
                    status="READY"
                    description="Awaiting approval"
                />
                <DashboardCard
                    title="Payments Pending"
                    value="0"
                    status="READY"
                    description="Awaiting verification"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-operix-surface border border-slate-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                    <div className="text-center py-12 text-operix-muted">
                        No recent activity to display.
                    </div>
                </div>
                <div className="bg-operix-surface border border-slate-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Pipeline Health</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span>API Status</span>
                            <StatusBadge status="VERIFIED" label="Healthy" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span>n8n Connection</span>
                            <StatusBadge status="VERIFIED" label="Connected" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span>DB Health</span>
                            <StatusBadge status="VERIFIED" label="Online" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DashboardCard({ title, value, status, description }: {
    title: string;
    value: string;
    status: string;
    description: string;
}) {
    return (
        <div className="bg-operix-surface border border-slate-700 rounded-xl p-6 hover:border-operix-primary transition-colors group">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-medium text-operix-muted group-hover:text-operix-text transition-colors">
                    {title}
                </h3>
                <StatusBadge status={status} />
            </div>
            <div className="text-3xl font-bold mb-1">{value}</div>
            <p className="text-xs text-operix-muted">{description}</p>
        </div>
    );
}
