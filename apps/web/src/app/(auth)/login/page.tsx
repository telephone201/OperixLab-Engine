"use client";

import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { authApi } from '@/lib/auth-api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        if (isSubmitting) {
            return;
        }

        setError(null);

        if (!email.trim() || !password) {
            setError('Email and password are required');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await authApi.login({
                email: email.trim(),
                password
            });

            login(
                response.accessToken,
                response.user,
                response.expiresAt
            );

            router.push('/');
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Unable to sign in'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-operix-background flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-operix-surface border border-slate-700 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-operix-primary rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4">
                        O
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        Operix Operator
                    </h1>
                    <p className="text-operix-muted text-sm mt-2">
                        Authentication required to access the dashboard
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-operix-muted">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-operix-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-operix-muted">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    void handleLogin();
                                }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-operix-primary outline-none transition-all"
                        />
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        onClick={() => void handleLogin()}
                        disabled={isSubmitting}
                        className="w-full bg-operix-primary hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors shadow-lg"
                    >
                        {isSubmitting ? 'Signing In...' : 'Sign In'}
                    </button>
                </div>
            </div>
        </div>
    );
}
