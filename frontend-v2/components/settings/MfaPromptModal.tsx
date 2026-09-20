'use client';

import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MfaPromptModalProps {
    isOpen: boolean;
    isDarkMode: boolean;
    isSubmitting: boolean;
    error?: string;
    onSubmit: (mfaCode: string) => void;
    onClose: () => void;
}

export default function MfaPromptModal({
    isOpen,
    isDarkMode,
    isSubmitting,
    error,
    onSubmit,
    onClose,
}: MfaPromptModalProps) {
    const [mfaCode, setMfaCode] = useState('');

    useEffect(() => {
        if (isOpen) setMfaCode('');
    }, [isOpen]);

    if (!isOpen) return null;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (/^\d{6}$/.test(mfaCode) && !isSubmitting) onSubmit(mfaCode);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <form
                onSubmit={submit}
                className={cn(
                    'relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl',
                    isDarkMode ? 'bg-ink-surface border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900',
                )}
            >
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    aria-label="Close MFA prompt"
                    className="absolute top-4 right-4 rounded-full p-1 text-gray-400 hover:bg-black/10 disabled:opacity-40"
                >
                    <X size={20} />
                </button>
                <div className="flex items-center gap-3 pr-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-violet-500">
                        <KeyRound size={20} />
                    </div>
                    <h2 className="text-lg font-bold">AWS sign-in required</h2>
                </div>
                <p className={cn('mt-4 text-sm', isDarkMode ? 'text-ink-text-muted' : 'text-gray-600')}>
                    Your AWS session has expired. Enter the current six-digit code from your configured MFA device to reconnect.
                </p>
                <input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    aria-label="Six-digit MFA code"
                    className={cn(
                        'mt-5 w-full rounded-lg border p-3 text-center font-mono text-xl tracking-[0.45em] outline-none focus:border-violet-500',
                        isDarkMode ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50',
                    )}
                />
                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                <button
                    type="submit"
                    disabled={!/^\d{6}$/.test(mfaCode) || isSubmitting}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 font-bold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSubmitting && <LoaderCircle size={18} className="animate-spin" />}
                    {isSubmitting ? 'Verifying…' : 'Refresh AWS session'}
                </button>
            </form>
        </div>
    );
}
