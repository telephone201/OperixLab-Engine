"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
    ArrowUp,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Clock,
    XCircle,
    Sparkles,
    Search,
    Users,
    Briefcase,
    Activity,
    Compass,
    ArrowRight,
    ShieldAlert,
    DollarSign,
    Layers,
    Bell,
    Check
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { chatApi } from '@/lib/chat-api';
import type {
    ChatInstruction,
    ChatInstructionStatus,
    ChatDiscoveryResult,
    CompanySummaryResult,
    AttentionRequiredResult,
    PipelineAnalysisResult
} from '@/types/chat';

// ─── Starter actions ───────────────────────────────────────────────────────
const STARTER_ACTIONS: {
    label: string;
    prompt: string;
    icon: React.ElementType;
    description: string;
}[] = [
    {
        label: 'Find companies that may need automation',
        prompt: 'Find companies that may need automation.',
        icon: Search,
        description: 'Discovery plan for prospective accounts',
    },
    {
        label: 'Company status summary',
        prompt: 'Give me company status',
        icon: Activity,
        description: 'Real-time overview of Operix Labs',
    },
    {
        label: 'What needs my attention?',
        prompt: 'What needs my attention?',
        icon: AlertCircle,
        description: 'Pending approvals, pricing, and blockers',
    },
    {
        label: 'Analyze current pipeline',
        prompt: 'Analyze current pipeline',
        icon: Sparkles,
        description: 'Operational health and throughput audit',
    },
    {
        label: 'Show high-intent leads',
        prompt: 'Show me the high-intent leads ready for outreach.',
        icon: Compass,
        description: 'Filter leads with strong buying signals',
    },
    {
        label: 'Review pending commercial actions',
        prompt: 'Review pending commercial actions and proposals.',
        icon: Briefcase,
        description: 'Check pricing and contract stages',
    },
];

// ─── Status display config ────────────────────────────────────────────────
const STATUS_CONFIG: Record<
    ChatInstructionStatus,
    { label: string; icon: React.ElementType; className: string }
> = {
    DRAFT: {
        label: 'Plan prepared — confirmation required',
        icon: Clock,
        className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    CONFIRMED: {
        label: 'Confirmed — initiating execution…',
        icon: Loader2,
        className: 'text-blue-400 bg-blue-500/10 border-blue-500/20 animate-spin',
    },
    RUNNING: {
        label: 'Running execution plan…',
        icon: Loader2,
        className: 'text-blue-400 bg-blue-500/10 border-blue-500/20 animate-spin',
    },
    WAITING_REVIEW: {
        label: 'Execution complete — review results',
        icon: CheckCircle2,
        className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    COMPLETED: {
        label: 'Completed',
        icon: CheckCircle2,
        className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    FAILED: {
        label: 'Execution failed',
        icon: XCircle,
        className: 'text-red-400 bg-red-500/10 border-red-500/20',
    },
};

export function OperixAIChatWorkspace() {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [input, setInput] = useState('');
    const [current, setCurrent] = useState<ChatInstruction | null>(null);
    const [history, setHistory] = useState<ChatInstruction[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [historyLoading, setHistoryLoading] = useState(true);

    const canManage = user?.role === 'OWNER' || user?.role === 'OPERATOR';

    const loadHistory = useCallback(async () => {
        try {
            const items = await chatApi.listInstructions();
            setHistory(items);
            return items;
        } catch {
            return [];
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    // Initial history load
    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    // Poll active instruction while running or confirmed until terminal state
    useEffect(() => {
        if (!current) return;
        if (current.status !== 'CONFIRMED' && current.status !== 'RUNNING') return;

        const interval = setInterval(async () => {
            try {
                const refreshed = await chatApi.getInstruction(current.id);
                if (refreshed.status !== current.status || refreshed.result !== current.result) {
                    setCurrent(refreshed);
                    void loadHistory();
                }
            } catch {
                // Ignore transient polling errors
            }
        }, 800);

        return () => clearInterval(interval);
    }, [current, loadHistory]);

    // Listen for instruction selection or creation events from sidebar
    useEffect(() => {
        function handleSelectInstruction(event: Event) {
            const customEvent = event as CustomEvent<ChatInstruction | { id: string }>;
            if (customEvent.detail) {
                if ('instruction_text' in customEvent.detail) {
                    setCurrent(customEvent.detail as ChatInstruction);
                } else if ('id' in customEvent.detail) {
                    const id = customEvent.detail.id;
                    const found = history.find((h) => h.id === id);
                    if (found) {
                        setCurrent(found);
                    } else {
                        chatApi.getInstruction(id).then(setCurrent).catch(() => {});
                    }
                }
            }
        }

        function handleNewChat() {
            setCurrent(null);
            setInput('');
            setError(null);
            inputRef.current?.focus();
        }

        window.addEventListener('operix:select-instruction', handleSelectInstruction);
        window.addEventListener('operix:new-chat', handleNewChat);

        return () => {
            window.removeEventListener('operix:select-instruction', handleSelectInstruction);
            window.removeEventListener('operix:new-chat', handleNewChat);
        };
    }, [history]);

    // Handle URL param selection (?id=...)
    useEffect(() => {
        const id = searchParams.get('id');
        if (id) {
            const found = history.find((h) => h.id === id);
            if (found) {
                setCurrent(found);
            } else {
                chatApi.getInstruction(id).then(setCurrent).catch(() => {});
            }
        } else {
            setCurrent(null);
            setInput('');
            setError(null);
        }
    }, [searchParams, history]);

    // Auto-scroll on active instruction change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [current, loading]);

    async function handleSend(rawText: string) {
        const text = rawText.trim();
        if (!text || !canManage || loading) return;

        setError(null);
        setLoading(true);
        setCurrent(null);
        setInput('');

        try {
            const created = await chatApi.createInstruction(text);
            setCurrent(created);

            // Reflect the created instruction in the URL
            const basePath = pathname === '/chat' ? '/chat' : '/';
            router.replace(`${basePath}?id=${created.id}`);

            // Notify sidebar and reload history
            await loadHistory();
            window.dispatchEvent(
                new CustomEvent('operix:instruction-created', { detail: created })
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create instruction.');
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm() {
        if (!current || !canManage || confirming) return;

        setConfirming(true);
        setError(null);

        try {
            const confirmed = await chatApi.confirmInstruction(current.id);
            setCurrent(confirmed);
            await loadHistory();

            // Refresh post-confirmation state
            const refreshed = await chatApi.getInstruction(current.id);
            setCurrent(refreshed);
            await loadHistory();

            window.dispatchEvent(
                new CustomEvent('operix:instruction-updated', { detail: refreshed })
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to confirm instruction.');
        } finally {
            setConfirming(false);
        }
    }

    function handleFormSubmit(e: React.FormEvent) {
        e.preventDefault();
        void handleSend(input);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend(input);
        }
    }

    function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        setInput(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }

    function startNewChat() {
        setCurrent(null);
        setInput('');
        setError(null);
        const basePath = pathname === '/chat' ? '/chat' : '/';
        router.push(basePath);
        window.dispatchEvent(new CustomEvent('operix:new-chat'));
        inputRef.current?.focus();
    }

    const isBusy = loading || confirming;
    const isIdle = !loading && !current;

    return (
        <div className="flex flex-col h-full bg-[#0b1120] text-slate-100">
            {/* Top Workspace Bar */}
            <div className="shrink-0 h-14 border-b border-white/[0.06] bg-[#0f172a]/70 backdrop-blur px-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        Operix AI
                    </span>
                    <span className="text-xs text-slate-500 hidden sm:inline">
                        — Operating Assistant
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {current && (
                        <button
                            type="button"
                            onClick={startNewChat}
                            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
                        >
                            + New Chat
                        </button>
                    )}
                    <span className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                        {user?.role ?? 'VIEWER'}
                    </span>
                </div>
            </div>

            {/* Conversation Flow Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
                    {/* Empty State: Operix AI Greeting & Starter Actions */}
                    {isIdle && (
                        <div className="py-8 text-center flex flex-col items-center">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-[1px] shadow-lg shadow-blue-500/20 mb-5">
                                <div className="w-full h-full rounded-[15px] bg-[#0f172a] flex items-center justify-center">
                                    <Sparkles size={20} className="text-blue-400" />
                                </div>
                            </div>

                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                                Operix AI
                            </h1>
                            <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-md">
                                Your operating assistant for Operix Labs.
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                                Give Operix an instruction, review the execution plan, then confirm it before anything runs.
                            </p>

                            {/* Starter action grid */}
                            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                                {STARTER_ACTIONS.map((action) => {
                                    const Icon = action.icon;
                                    return (
                                        <button
                                            key={action.label}
                                            type="button"
                                            onClick={() => {
                                                setInput(action.prompt);
                                                inputRef.current?.focus();
                                            }}
                                            className="group relative p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-blue-500/30 transition-all text-left"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 rounded-lg bg-slate-800/80 border border-white/[0.04] text-slate-400 group-hover:text-blue-400 transition-colors shrink-0">
                                                    <Icon size={16} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors leading-snug">
                                                        {action.label}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                                                        {action.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Recent Instructions preview if any exist */}
                            {!historyLoading && history.length > 0 && (
                                <div className="mt-12 w-full text-left">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3 px-1">
                                        Recent instructions
                                    </p>
                                    <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.01]">
                                        {history.slice(0, 4).map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => {
                                                    setCurrent(item);
                                                    const basePath = pathname === '/chat' ? '/chat' : '/';
                                                    router.push(`${basePath}?id=${item.id}`);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-4"
                                            >
                                                <span className="text-sm text-slate-300 truncate">
                                                    {item.instruction_text}
                                                </span>
                                                <span className="text-[11px] text-slate-500 shrink-0 font-medium">
                                                    {item.status}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Active Conversation view */}
                    {loading && (
                        <div className="space-y-6">
                            <UserMessageBubble text={input || 'Creating instruction…'} />
                            <AiMessageBubble>
                                <div className="flex items-center gap-3 text-slate-300 py-2">
                                    <Loader2 size={16} className="animate-spin text-blue-400" />
                                    <span className="text-sm">
                                        Operix AI is analyzing the request and structuring the execution plan…
                                    </span>
                                </div>
                            </AiMessageBubble>
                        </div>
                    )}

                    {current && !loading && (
                        <div className="space-y-6">
                            <UserMessageBubble text={current.instruction_text} />

                            <AiMessageBubble>
                                <div className="space-y-5">
                                    {/* Plan status header */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                                                Status:
                                            </span>
                                            <StatusPill status={current.status} />
                                        </div>

                                        <span className="text-[11px] text-slate-500">
                                            ID: {current.id.slice(0, 8)}
                                        </span>
                                    </div>

                                    {/* Intent */}
                                    {current.intent && (
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                                                Intent
                                            </p>
                                            <p className="text-sm text-slate-200 bg-white/[0.02] border border-white/[0.04] px-3.5 py-2.5 rounded-lg">
                                                {current.intent}
                                            </p>
                                        </div>
                                    )}

                                    {/* Plan Summary */}
                                    {current.plan?.summary && (
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                                                Execution Plan
                                            </p>
                                            <p className="text-sm text-slate-300 leading-relaxed">
                                                {current.plan.summary}
                                            </p>
                                        </div>
                                    )}

                                    {/* Search terms */}
                                    {current.plan?.searchTerms && current.plan.searchTerms.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                                                Search Parameters
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {current.plan.searchTerms.map((term, i) => (
                                                    <span
                                                        key={`${term}-${i}`}
                                                        className="px-3 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-300"
                                                    >
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Steps */}
                                    {current.plan?.steps && current.plan.steps.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                                                Planned Sequence
                                            </p>
                                            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-300 marker:text-slate-500">
                                                {current.plan.steps.map((step, i) => (
                                                    <li key={i}>{step}</li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}

                                    {/* Target Location */}
                                    {current.plan?.locationQuery && (
                                        <div>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                                                Target Geography
                                            </p>
                                            <p className="text-sm text-slate-300">
                                                {current.plan.locationQuery}
                                            </p>
                                        </div>
                                    )}

                                    {/* Confirmation Action for DRAFT */}
                                    {current.status === 'DRAFT' && (
                                        <div className="pt-2 border-t border-white/[0.06]">
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-sm font-semibold text-white">
                                                        Confirmation Required
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        {current.intent === 'DISCOVER_LEADS'
                                                            ? 'Operix requires explicit confirmation before initiating automated discovery.'
                                                            : 'Operix requires explicit confirmation before executing this operational intelligence plan.'}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => void handleConfirm()}
                                                    disabled={confirming || !canManage}
                                                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 shrink-0"
                                                >
                                                    {confirming ? (
                                                        <>
                                                            <Loader2 size={15} className="animate-spin" />
                                                            Confirming…
                                                        </>
                                                    ) : (
                                                        <>Confirm &amp; Execute Plan</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Results if completed or review waiting */}
                                    {(current.status === 'COMPLETED' || current.status === 'WAITING_REVIEW') && current.result && (() => {
                                        const res = current.result as any;
                                        return (
                                            <div className="mt-4 pt-4 border-t border-white/[0.06]">
                                                {res.type === 'COMPANY_SUMMARY' && (
                                                    <CompanySummaryView result={res as CompanySummaryResult} />
                                                )}
                                                {res.type === 'ATTENTION_REQUIRED' && (
                                                    <AttentionRequiredView result={res as AttentionRequiredResult} />
                                                )}
                                                {res.type === 'PIPELINE_ANALYSIS' && (
                                                    <PipelineAnalysisView result={res as PipelineAnalysisResult} />
                                                )}
                                                {(!res.type || res.provider) && (
                                                    <DiscoveryResultView result={res as ChatDiscoveryResult} />
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Failure Alert */}
                                    {current.status === 'FAILED' && current.error && (
                                        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                                            <XCircle size={18} className="mt-0.5 shrink-0" />
                                            <div>
                                                <p className="font-semibold text-red-200">Execution Error</p>
                                                <p className="mt-1 text-xs">{current.error}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </AiMessageBubble>
                        </div>
                    )}

                    {/* Error Banner */}
                    {error && (
                        <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div ref={bottomRef} className="h-6" />
                </div>
            </div>

            {/* Pinned Message Composer */}
            <div className="shrink-0 border-t border-white/[0.06] bg-[#0f172a] px-4 py-4">
                <div className="max-w-3xl mx-auto">
                    {!canManage && (
                        <p className="mb-2 text-xs text-amber-400/90 text-center font-medium">
                            VIEWER access is read-only. Instruction creation and execution require OWNER or OPERATOR role.
                        </p>
                    )}

                    <form onSubmit={handleFormSubmit} className="relative flex items-end">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            disabled={isBusy || !canManage}
                            placeholder={
                                canManage
                                    ? 'Message Operix AI… (e.g. Give me company status, or Find companies needing automation)'
                                    : 'VIEWER role — instruction submission disabled'
                            }
                            rows={1}
                            className="w-full resize-none rounded-2xl border border-white/[0.1] bg-[#1e293b] px-5 py-4 pr-14 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all leading-relaxed shadow-inner"
                            style={{ minHeight: '56px', maxHeight: '180px', overflowY: 'auto' }}
                        />

                        <button
                            type="submit"
                            disabled={isBusy || !canManage || !input.trim()}
                            className="absolute right-3 bottom-3 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all shadow-md shadow-blue-600/20"
                            aria-label="Send message"
                        >
                            {isBusy ? (
                                <Loader2 size={16} className="animate-spin text-white" />
                            ) : (
                                <ArrowUp size={16} className="text-white" />
                            )}
                        </button>
                    </form>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 px-1">
                        <span>Operix AI v1 — Operating Assistant</span>
                        <span className="hidden sm:inline">Press Enter to send · Shift+Enter for newline</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────────
function UserMessageBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[85%] sm:max-w-[75%] bg-blue-600/25 border border-blue-500/30 rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm text-slate-100 shadow-sm leading-relaxed whitespace-pre-wrap">
                {text}
            </div>
        </div>
    );
}

function AiMessageBubble({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex justify-start">
            <div className="flex items-start gap-3.5 max-w-[95%] sm:max-w-[88%] w-full">
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={14} className="text-blue-400" />
                </div>
                <div className="flex-1 bg-[#1e293b]/70 border border-white/[0.08] rounded-2xl rounded-tl-sm p-5 text-sm text-slate-200 shadow-sm">
                    {children}
                </div>
            </div>
        </div>
    );
}

function StatusPill({ status }: { status: ChatInstructionStatus }) {
    const config = STATUS_CONFIG[status];
    const Icon = config?.icon ?? Clock;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                config?.className ?? 'text-slate-400 border-slate-700 bg-slate-800'
            }`}
        >
            <Icon size={12} className={status === 'RUNNING' || status === 'CONFIRMED' ? 'animate-spin' : undefined} />
            {config?.label ?? status}
        </span>
    );
}

// ─── Discovery Result Component ───────────────────────────────────────────
function DiscoveryResultView({
    result,
}: {
    result: ChatDiscoveryResult;
}) {
    const metrics = [
        { label: 'Discovered', value: result.discoveredLeadCount ?? 0, color: 'text-white' },
        { label: 'Persisted', value: result.persistedCount ?? 0, color: 'text-emerald-400' },
        { label: 'Duplicates', value: result.duplicateCount ?? 0, color: 'text-slate-400' },
        { label: 'Skipped', value: result.skippedCount ?? 0, color: 'text-amber-400' },
        { label: 'Errors', value: result.errorCount ?? 0, color: 'text-red-400' },
    ];

    return (
        <div className="space-y-4">
            <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2.5">
                    Automated Discovery Results
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {metrics.map((m) => (
                        <div
                            key={m.label}
                            className="bg-slate-900/80 border border-white/[0.04] rounded-xl p-3"
                        >
                            <p className="text-[10px] text-slate-400">{m.label}</p>
                            <p className={`text-xl font-bold mt-0.5 ${m.color}`}>{m.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {(result.errorCount ?? 0) > 0 && result.errors?.length ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    <p className="font-semibold mb-1">Execution reported errors:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {result.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-400">
                    Discovered leads are now available for enrichment &amp; qualification.
                </span>

                <Link
                    href="/acquisition"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
                >
                    Open Acquisition Workspace
                    <ArrowRight size={13} />
                </Link>
            </div>
        </div>
    );
}

// ─── Company Summary Component ────────────────────────────────────────────
function CompanySummaryView({ result }: { result: CompanySummaryResult }) {
    return (
        <div className="space-y-4">
            {/* Header / Narrative */}
            <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                        Executive Status Summary
                    </p>
                    <span className="text-[11px] text-slate-500">
                        {new Date(result.generatedAt).toLocaleTimeString()}
                    </span>
                </div>
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-slate-200 leading-relaxed">
                    {result.executiveNarrative}
                </div>
            </div>

            {/* 4 Pillars Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Acquisition */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.06] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                        <Users size={14} />
                        <span>Acquisition Pipeline</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-400">Total Leads:</span>{' '}
                            <span className="font-semibold text-white">{result.acquisition.totalLeads}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">New:</span>{' '}
                            <span className="font-semibold text-slate-200">{result.acquisition.newLeads}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Qualified:</span>{' '}
                            <span className="font-semibold text-emerald-400">{result.acquisition.qualifiedLeads}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">High-Intent:</span>{' '}
                            <span className="font-semibold text-amber-400">{result.acquisition.highIntentLeads}</span>
                        </div>
                    </div>
                </div>

                {/* Commercial */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.06] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                        <DollarSign size={14} />
                        <span>Commercial Operations</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-400">Packages:</span>{' '}
                            <span className="font-semibold text-white">{result.commercial.packagesCount}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Pending Pricing:</span>{' '}
                            <span className="font-semibold text-amber-400">{result.commercial.pendingPricingReviews}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Proposals:</span>{' '}
                            <span className="font-semibold text-slate-200">{result.commercial.proposalsCount}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Accepted:</span>{' '}
                            <span className="font-semibold text-emerald-400">{result.commercial.acceptedAgreements}</span>
                        </div>
                    </div>
                </div>

                {/* Delivery */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.06] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                        <Layers size={14} />
                        <span>Project Delivery</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-400">Ready to Start:</span>{' '}
                            <span className="font-semibold text-emerald-400">{result.delivery.readyToStart}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">In Progress:</span>{' '}
                            <span className="font-semibold text-blue-400">{result.delivery.inProgress}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Blocked:</span>{' '}
                            <span className="font-semibold text-red-400">{result.delivery.blocked}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Completed:</span>{' '}
                            <span className="font-semibold text-slate-200">{result.delivery.completed}</span>
                        </div>
                    </div>
                </div>

                {/* Attention */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.06] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                        <ShieldAlert size={14} />
                        <span>Attention &amp; Governance</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-400">Pending Approvals:</span>{' '}
                            <span className="font-semibold text-amber-400">{result.attention.pendingApprovals}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Payment Reviews:</span>{' '}
                            <span className="font-semibold text-amber-400">{result.attention.pendingPaymentReviews}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-slate-400">Unread Notifications:</span>{' '}
                            <span className="font-semibold text-slate-200">{result.attention.unreadNotifications}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Link
                    href="/acquisition"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-300 transition-colors"
                >
                    Acquisition Workspace
                    <ArrowRight size={12} />
                </Link>
                <Link
                    href="/commercial"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-300 transition-colors"
                >
                    Commercial Workspace
                    <ArrowRight size={12} />
                </Link>
                <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-slate-300 transition-colors"
                >
                    Projects Workspace
                    <ArrowRight size={12} />
                </Link>
            </div>
        </div>
    );
}

// ─── Attention Required Component ────────────────────────────────────────
function AttentionRequiredView({ result }: { result: AttentionRequiredResult }) {
    const isAllClear = result.totalItemsRequiringAttention === 0;

    return (
        <div className="space-y-4">
            <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                    Operational Attention &amp; Action Items
                </p>

                <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                        isAllClear
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                    }`}
                >
                    {isAllClear ? (
                        <CheckCircle2 size={18} className="mt-0.5 text-emerald-400 shrink-0" />
                    ) : (
                        <AlertCircle size={18} className="mt-0.5 text-amber-400 shrink-0" />
                    )}
                    <div className="text-sm">
                        <p className="font-semibold text-white">
                            {isAllClear ? 'All Clear — No Urgent Action Needed' : result.summary}
                        </p>
                    </div>
                </div>
            </div>

            {/* List of pending approvals */}
            {result.pendingApprovals.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Pending Governance Approvals ({result.pendingApprovals.length})
                    </p>
                    <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                        {result.pendingApprovals.map((item) => (
                            <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-3">
                                <div>
                                    <span className="font-semibold text-slate-200">{item.approvalType}</span>
                                    <span className="text-slate-500 ml-2">({item.entityType})</span>
                                    {item.reason && <p className="text-slate-400 text-[11px] mt-0.5">{item.reason}</p>}
                                </div>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                    {new Date(item.requestedAt).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pending pricing reviews */}
            {result.pendingPricingReviews.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Pending Pricing Reviews ({result.pendingPricingReviews.length})
                    </p>
                    <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                        {result.pendingPricingReviews.map((item) => (
                            <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-3">
                                <div>
                                    <span className="font-semibold text-slate-200">
                                        {item.recommendedPrice.toLocaleString()} {item.currency}
                                    </span>
                                    <span className="text-slate-500 ml-2">Status: {item.status}</span>
                                </div>
                                <Link
                                    href="/commercial"
                                    className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                                >
                                    Review &rarr;
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pending payment reviews */}
            {result.pendingPaymentReviews.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Pending Payment Verifications ({result.pendingPaymentReviews.length})
                    </p>
                    <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                        {result.pendingPaymentReviews.map((item) => (
                            <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-3">
                                <div>
                                    <span className="font-semibold text-slate-200">
                                        {item.submittedAmount !== null ? item.submittedAmount.toLocaleString() : item.expectedAmount.toLocaleString()} {item.currency}
                                    </span>
                                    <span className="text-slate-500 ml-2">
                                        (Expected: {item.expectedAmount.toLocaleString()})
                                    </span>
                                </div>
                                <Link
                                    href="/commercial"
                                    className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                                >
                                    Verify &rarr;
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actionable / Blocked projects */}
            {result.actionableProjects.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Actionable Projects ({result.actionableProjects.length})
                    </p>
                    <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
                        {result.actionableProjects.map((item) => (
                            <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-3">
                                <span className="font-semibold text-slate-200">{item.name}</span>
                                <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        item.status === 'BLOCKED'
                                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    }`}
                                >
                                    {item.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Pipeline Analysis Component ──────────────────────────────────────────
function PipelineAnalysisView({ result }: { result: PipelineAnalysisResult }) {
    return (
        <div className="space-y-4">
            {/* Summary */}
            <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                    Pipeline Health &amp; Conversion Analysis
                </p>
                <div className="p-4 rounded-xl bg-slate-900/80 border border-white/[0.06] text-sm text-slate-200 leading-relaxed">
                    {result.summary}
                </div>
            </div>

            {/* Conversion Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.04]">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Qualification Rate</p>
                    <p className="text-xl font-bold text-emerald-400 mt-1">
                        {result.stages.acquisition.qualificationRatePct}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">of total leads</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.04]">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">High-Intent Ratio</p>
                    <p className="text-xl font-bold text-amber-400 mt-1">
                        {result.stages.acquisition.highIntentRatioPct}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">of qualified leads</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.04] col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Proposal Conversion</p>
                    <p className="text-xl font-bold text-purple-400 mt-1">
                        {result.stages.commercial.proposalConversionRatePct}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">agreements / proposals</p>
                </div>
            </div>

            {/* Bottlenecks */}
            {result.bottlenecks.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Operational Bottlenecks ({result.bottlenecks.length})
                    </p>
                    <div className="space-y-2">
                        {result.bottlenecks.map((b, i) => (
                            <div
                                key={i}
                                className="p-3 rounded-xl bg-slate-900/70 border border-white/[0.06] flex items-start gap-3"
                            >
                                <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 shrink-0 ${
                                        b.severity === 'HIGH'
                                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                            : b.severity === 'MEDIUM'
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    }`}
                                >
                                    {b.severity}
                                </span>
                                <div>
                                    <p className="text-xs font-semibold text-slate-200">
                                        Stage: {b.stage}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        {b.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Strategic Focus Areas */}
            {result.suggestedFocusAreas.length > 0 && (
                <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Strategic Focus Recommendations
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                        {result.suggestedFocusAreas.map((area, i) => (
                            <li key={i} className="flex items-center gap-2">
                                <Check size={14} className="text-emerald-400 shrink-0" />
                                <span>{area}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
