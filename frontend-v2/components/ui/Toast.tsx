'use client';

import React from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export default function Toast() {
    const { toast, showToast, isDarkMode } = useApp();

    if (!toast.message || !toast.type) return null;

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
        error: <XCircle className="w-5 h-5 text-rose-500" />,
        info: <Info className="w-5 h-5 text-sky-500" />
    };

    const colors = {
        success: isDarkMode ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100" : "bg-emerald-50 border-emerald-100 text-emerald-800",
        error: isDarkMode ? "bg-rose-500/10 border-rose-500/20 text-rose-100" : "bg-rose-50 border-rose-100 text-rose-800",
        info: isDarkMode ? "bg-sky-500/10 border-sky-500/20 text-sky-100" : "bg-sky-50 border-sky-100 text-sky-800"
    };

    return (
        <div className="fixed bottom-6 right-6 z-[200] animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md",
                colors[toast.type]
            )}>
                <div className="flex-shrink-0">
                    {icons[toast.type]}
                </div>
                <p className="text-sm font-medium pr-2">
                    {toast.message}
                </p>
                <button
                    onClick={() => showToast('', 'info', 0)}
                    className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                >
                    <X className="w-4 h-4 opacity-50 hover:opacity-100" />
                </button>
            </div>
        </div>
    );
}
