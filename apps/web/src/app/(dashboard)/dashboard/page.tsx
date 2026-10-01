"use client";

import React, { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { apiClient } from "@/lib/api-client";

interface DashboardSummary {
    acquisition: {
        qualifiedLeads: number;
        highIntentLeads: number;
    };
    commercial: {
        commercialPackages: number;
        pricingRecommendations: number;
        proposals: number;
    };
    actionRequired: {
        pendingApprovals: number;
        pendingPaymentReviews: number;
        unreadNotifications: number;
    };
    delivery: {
        pendingProjects: number;
        readyToStartProjects: number;
        startedProjects: number;
    };
    governance: {
        totalApprovals: number;
    };
}

export default function DashboardWorkspacePage() {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSummary() {
            try {
                const response = await apiClient.get<DashboardSummary>(
                    "/dashboard/summary"
                );

                if (response.error) {
                    setError(response.error.message);
                    return;
                }

                if (response.data) {
                    setSummary(response.data);
                }
            } catch {
                setError("Failed to load dashboard summary.");
            } finally {
                setLoading(false);
            }
        }

        fetchSummary();
    }, []);

    if (loading) {
        return (
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operational Overview
                    </h1>
                    <p className="text-operix-muted">
                        Welcome back, Operator. Here is the current state of the pipeline.
                    </p>
                </div>
                <div className="text-operix-muted">
                    Loading dashboard data...
                </div>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operational Overview
                    </h1>
                    <p className="text-operix-muted">
                        Welcome back, Operator. Here is the current state of the pipeline.
                    </p>
                </div>

                <div className="bg-red-950/40 border border-red-800 rounded-xl p-6 text-red-300">
                    {error || "Dashboard data is unavailable."}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    Operational Overview
                </h1>
                <p className="text-operix-muted">
                    Welcome back, Operator. Here is the current state of the pipeline.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard
                    title="Qualified Leads"
                    value={String(summary.acquisition.qualifiedLeads)}
                    status="QUALIFIED"
                    description={`${summary.acquisition.highIntentLeads} high-intent leads`}
                />

                <DashboardCard
                    title="Pricing Reviews"
                    value={String(summary.commercial.pricingRecommendations)}
                    status="PENDING"
                    description="Awaiting pricing review"
                />

                <DashboardCard
                    title="Proposal Reviews"
                    value={String(summary.commercial.proposals)}
                    status="READY"
                    description="Proposal pipeline"
                />

                <DashboardCard
                    title="Payment Reviews"
                    value={String(summary.actionRequired.pendingPaymentReviews)}
                    status="READY"
                    description="Awaiting verification"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-operix-surface border border-slate-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        Pipeline Overview
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Metric
                            label="Commercial Packages"
                            value={summary.commercial.commercialPackages}
                        />
                        <Metric
                            label="Pending Projects"
                            value={summary.delivery.pendingProjects}
                        />
                        <Metric
                            label="Ready to Start"
                            value={summary.delivery.readyToStartProjects}
                        />
                    </div>
                </div>

                <div className="bg-operix-surface border border-slate-700 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        Pipeline Health
                    </h2>

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

                        <div className="flex items-center justify-between text-sm">
                            <span>Started Projects</span>
                            <span className="font-semibold">
                                {summary.delivery.startedProjects}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-operix-surface border border-slate-700 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4">
                    Action Required
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Metric
                        label="Pending Approvals"
                        value={summary.actionRequired.pendingApprovals}
                    />
                    <Metric
                        label="Payment Reviews"
                        value={summary.actionRequired.pendingPaymentReviews}
                    />
                    <Metric
                        label="Unread Notifications"
                        value={summary.actionRequired.unreadNotifications}
                    />
                </div>
            </div>
        </div>
    );
}

function DashboardCard({
    title,
    value,
    status,
    description,
}: {
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

            <div className="text-3xl font-bold mb-1">
                {value}
            </div>

            <p className="text-xs text-operix-muted">
                {description}
            </p>
        </div>
    );
}

function Metric({
    label,
    value,
}: {
    label: string;
    value: number;
}) {
    return (
        <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-xs text-operix-muted mb-1">
                {label}
            </div>

            <div className="text-2xl font-bold">
                {value}
            </div>
        </div>
    );
}
