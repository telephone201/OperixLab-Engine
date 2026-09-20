import { cn } from '@/lib/utils';
import React from 'react';

export interface StatusBadgeProps {
    status: string;
    label?: string;
}

const STATUS_MAP: Record<string, { color: string; label?: string }> = {
    // General
    'PENDING': { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
    'READY': { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    'APPROVED': { color: 'bg-green-500/10 text-green-500 border-green-500/20' },
    'REJECTED': { color: 'bg-red-500/10 text-red-500 border-red-500/20' },
    'STALE': { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
    'BLOCKED': { color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
    'VERIFIED': { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    'STARTED': { color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
    'IN_PROGRESS': { color: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
    'COMPLETED': { color: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
    const config = STATUS_MAP[status.toUpperCase()] || {
        color: 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    };

    return (
        <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium border",
            config.color
        )}>
            {label || status}
        </span>
    );
}
