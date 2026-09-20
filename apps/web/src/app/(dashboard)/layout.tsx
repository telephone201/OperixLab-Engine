import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthProvider } from '@/hooks/use-auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <div className="flex h-screen bg-operix-background text-operix-text overflow-hidden">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto p-8">
                        {children}
                    </main>
                </div>
            </div>
        </AuthProvider>
    );
}
