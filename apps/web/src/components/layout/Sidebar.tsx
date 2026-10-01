"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Briefcase,
    CreditCard,
    FolderKanban,
    Plus,
    MessageSquare,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { chatApi } from '@/lib/chat-api';
import type { ChatInstruction } from '@/lib/chat-api';

const WORKSPACE_ITEMS = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Acquisition', href: '/acquisition', icon: Users },
    { name: 'Commercial', href: '/commercial', icon: Briefcase },
    { name: 'Payments', href: '/commercial/verification', icon: CreditCard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, logout } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const [recentInstructions, setRecentInstructions] = useState<ChatInstruction[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const displayName = user?.email ? user.email.split('@')[0] : 'Operator';
    const displayRole = user?.role ?? 'VIEWER';

    const currentId = searchParams?.get('id');
    const isOnChat = pathname === '/' || pathname === '/chat';

    const loadRecentInstructions = useCallback(async () => {
        try {
            const items = await chatApi.listInstructions();
            setRecentInstructions(items);
        } catch {
            // non-fatal
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        void loadRecentInstructions();
    }, [loadRecentInstructions]);

    // Refresh recent instructions when a new one is created or updated
    useEffect(() => {
        function handleRefresh() {
            void loadRecentInstructions();
        }

        window.addEventListener('operix:instruction-created', handleRefresh);
        window.addEventListener('operix:instruction-updated', handleRefresh);

        return () => {
            window.removeEventListener('operix:instruction-created', handleRefresh);
            window.removeEventListener('operix:instruction-updated', handleRefresh);
        };
    }, [loadRecentInstructions]);

    function handleNewChat() {
        window.dispatchEvent(new CustomEvent('operix:new-chat'));
        router.push(pathname === '/chat' ? '/chat' : '/');
    }

    function handleSelectInstruction(instruction: ChatInstruction) {
        window.dispatchEvent(
            new CustomEvent('operix:select-instruction', { detail: instruction })
        );
        const basePath = pathname === '/chat' ? '/chat' : '/';
        router.push(`${basePath}?id=${instruction.id}`);
    }

    function isWorkspaceActive(href: string) {
        return pathname.startsWith(href);
    }

    return (
        <>
            {/* Mobile backdrop */}
            {!collapsed && (
                <div
                    className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
                    onClick={() => setCollapsed(true)}
                />
            )}

            <aside
                className={cn(
                    'relative z-30 flex flex-col bg-[#111827] border-r border-white/[0.06] transition-all duration-200 ease-in-out shrink-0 select-none',
                    collapsed ? 'w-0 overflow-hidden lg:w-16' : 'w-64'
                )}
            >
                {/* Brand Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] min-h-[56px]">
                    {!collapsed && (
                        <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
                            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                                <Sparkles size={14} className="text-blue-400" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-sm font-bold text-white tracking-tight block truncate">
                                    Operix AI
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                    Operix Labs
                                </span>
                            </div>
                        </Link>
                    )}

                    <button
                        onClick={() => setCollapsed((prev) => !prev)}
                        className={cn(
                            'p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0',
                            collapsed && 'mx-auto'
                        )}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                {/* + New Chat Action */}
                <div className={cn('px-3 pt-3 pb-2', collapsed && 'px-2')}>
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border shadow-sm',
                            isOnChat && !currentId
                                ? 'bg-blue-600/15 border-blue-500/30 text-blue-300'
                                : 'bg-white/[0.03] border-white/[0.06] text-slate-200 hover:bg-white/[0.06] hover:text-white',
                            collapsed && 'justify-center px-2'
                        )}
                        title={collapsed ? 'New Chat' : undefined}
                    >
                        <Plus size={16} className="shrink-0 text-blue-400" />
                        {!collapsed && <span>New Chat</span>}
                    </button>
                </div>

                {/* Recent Chats Section */}
                {!collapsed && (
                    <div className="px-3 py-2 flex-1 overflow-y-auto min-h-0">
                        <div className="flex items-center justify-between px-2 mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Recent Chats
                            </span>
                            {recentInstructions.length > 0 && (
                                <span className="text-[10px] text-slate-600 font-medium">
                                    {recentInstructions.length}
                                </span>
                            )}
                        </div>

                        <div className="space-y-0.5">
                            {loadingHistory ? (
                                <div className="px-3 py-4 text-center">
                                    <span className="text-xs text-slate-600">Loading history…</span>
                                </div>
                            ) : recentInstructions.length === 0 ? (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-xs text-slate-600">
                                        No recent chats
                                    </p>
                                    <p className="text-[10px] text-slate-700 mt-0.5">
                                        Instructions will appear here
                                    </p>
                                </div>
                            ) : (
                                recentInstructions.map((item) => {
                                    const isSelected = currentId === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handleSelectInstruction(item)}
                                            className={cn(
                                                'w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 group',
                                                isSelected
                                                    ? 'bg-white/[0.08] text-white font-medium border border-white/[0.08]'
                                                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                                            )}
                                        >
                                            <MessageSquare
                                                size={13}
                                                className={cn(
                                                    'shrink-0 text-slate-500 group-hover:text-slate-400',
                                                    isSelected && 'text-blue-400'
                                                )}
                                            />
                                            <span className="truncate flex-1">
                                                {item.instruction_text}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* Workspace Navigation Section */}
                <div className={cn('px-3 mt-auto pt-3 border-t border-white/[0.06]', collapsed && 'px-2')}>
                    {!collapsed && (
                        <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Workspace
                        </p>
                    )}

                    <nav className="space-y-0.5 pb-2">
                        {WORKSPACE_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = isWorkspaceActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors',
                                        active
                                            ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                                        collapsed && 'justify-center px-2 py-2.5'
                                    )}
                                    title={collapsed ? item.name : undefined}
                                >
                                    <Icon size={15} className="shrink-0 text-slate-400" />
                                    {!collapsed && <span>{item.name}</span>}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* User Identity and Session Footer */}
                <div
                    className={cn(
                        'flex items-center gap-2.5 px-3 py-3 border-t border-white/[0.06] bg-[#0c121e] min-h-[52px]',
                        collapsed && 'justify-center px-2'
                    )}
                >
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-[11px] font-bold text-slate-300 uppercase">
                        {displayName.charAt(0)}
                    </div>

                    {!collapsed && (
                        <>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white truncate leading-tight">
                                    {displayName}
                                </p>
                                <span className="text-[10px] font-semibold tracking-wider text-blue-400">
                                    {displayRole}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => void logout()}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-white/[0.04] rounded-md transition-colors"
                                title="Sign out"
                                aria-label="Sign out"
                            >
                                <LogOut size={14} />
                            </button>
                        </>
                    )}
                </div>
            </aside>
        </>
    );
}
