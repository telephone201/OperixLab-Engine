import React from 'react';
import { User, Bell, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export function Header() {
    const { user, logout } = useAuth();

    return (
        <header className="h-16 border-b border-slate-700 bg-operix-surface px-6 flex items-center justify-between text-operix-text">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-operix-muted">
                    Environment: <span className="text-operix-primary font-bold">LOCAL</span>
                </span>
            </div>

            <div className="flex items-center gap-6">
                <button className="relative p-2 text-operix-muted hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-operix-surface" />
                </button>

                <div className="flex items-center gap-3 pl-6 border-l border-slate-700">
                    <div className="text-right">
                        <p className="text-sm font-medium">{user?.name || 'Operator'}</p>
                        <p className="text-xs text-operix-muted">{user?.role || 'Admin'}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <User size={18} />
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 text-operix-muted hover:text-red-400 transition-colors"
                        title="Logout"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </header>
    );
}
