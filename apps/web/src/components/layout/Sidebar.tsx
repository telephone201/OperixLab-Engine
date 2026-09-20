import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Search,
    FileText,
    Settings,
    Briefcase,
    CheckCircle,
    CreditCard,
    ArrowRightLeft,
    Activity,
    Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Acquisition', href: '/acquisition', icon: Users },
    { name: 'Research', href: '/research', icon: Search },
    { name: 'Qualification', href: '/qualification', icon: CheckCircle },
    { name: 'Solutions', href: '/solutions', icon: Briefcase },
    { name: 'Proposals', href: '/proposals', icon: FileText },
    { name: 'Agreements', href: '/agreements', icon: Lock },
    { name: 'Payments', href: '/payments', icon: CreditCard },
    { name: 'Projects', href: '/projects', icon: Activity },
    { name: 'Workflows', href: '/workflows', icon: ArrowRightLeft },
    { name: 'Monitoring', href: '/monitoring', icon: Activity },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 h-screen bg-operix-surface border-r border-slate-700 flex flex-col text-operix-text">
            <div className="p-6 border-b border-slate-700">
                <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    <div className="w-8 h-8 bg-operix-primary rounded-lg flex items-center justify-center text-white font-black">O</div>
                    Operix AI
                </h1>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            pathname === item.href
                                ? "bg-operix-primary text-white"
                                : "text-operix-muted hover:bg-slate-700 hover:text-white"
                        )}
                    >
                        <item.icon size={18} />
                        {item.name}
                    </Link>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-700">
                <div className="flex items-center gap-3 px-3 py-2 text-xs text-operix-muted">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Connected to API
                </div>
            </div>
        </aside>
    );
}
