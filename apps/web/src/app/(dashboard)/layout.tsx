"use client";

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

/**
 * Chat-first routes own their full viewport (scroll + pinned composer).
 * All other workspace routes get a standard scrollable padded container.
 */
const CHAT_ROUTES = new Set(['/', '/chat']);

function isChatRoute(pathname: string): boolean {
    return CHAT_ROUTES.has(pathname) || pathname.startsWith('/chat');
}

/**
 * Wraps workspace page content in a scrollable padded container.
 * Chat/home pages render as-is (they own their own scroll).
 */
function WorkspaceScroll({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (isChatRoute(pathname)) {
        // Chat pages manage their own scroll and pinned composer
        return <>{children}</>;
    }

    return (
        <main className="flex-1 overflow-y-auto p-8">
            {children}
        </main>
    );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace('/login');
        }
    }, [isLoading, isAuthenticated, router]);

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0f172a] text-slate-400 text-sm">
                Loading…
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="flex h-screen bg-[#0f172a] text-slate-50 overflow-hidden">
            <React.Suspense fallback={<aside className="w-64 bg-[#111827] border-r border-white/[0.06]" />}>
                <Sidebar />
            </React.Suspense>
            {/* Main content area. Chat routes own their layout; workspaces get p-8. */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <WorkspaceScroll>{children}</WorkspaceScroll>
            </div>
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DashboardShell>{children}</DashboardShell>
        </AuthProvider>
    );
}
