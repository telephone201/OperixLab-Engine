import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();

    const handleLogin = () => {
        // Mock authentication
        login('mock_token_123', {
            id: 'user_admin_123',
            email: 'admin@operix.ai',
            name: 'Operix Admin',
            role: 'ADMIN'
        });
        router.push('/dashboard');
    };

    return (
        <div className="min-h-screen bg-operix-background flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-operix-surface border border-slate-700 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-operix-primary rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4">O</div>
                    <h1 className="text-2xl font-bold text-white">Operix Operator</h1>
                    <p className="text-operix-muted text-sm mt-2">Authentication required to access the dashboard</p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-operix-muted">Email</label>
                        <input
                            type="email"
                            defaultValue="admin@operix.ai"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-operix-primary outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-operix-muted">Password</label>
                        <input
                            type="password"
                            defaultValue="********"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-operix-primary outline-none transition-all"
                        />
                    </div>
                    <button
                        onClick={handleLogin}
                        className="w-full bg-operix-primary hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors shadow-lg"
                    >
                        Sign In
                    </button>
                </div>
            </div>
        </div>
    );
}
