"use client";

import React, { Suspense } from 'react';
import { OperixAIChatWorkspace } from '@/components/domain/chat/OperixAIChatWorkspace';

export default function ChatPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-full items-center justify-center bg-[#0b1120] text-slate-500 text-sm">
                    Loading Operix AI…
                </div>
            }
        >
            <OperixAIChatWorkspace />
        </Suspense>
    );
}
