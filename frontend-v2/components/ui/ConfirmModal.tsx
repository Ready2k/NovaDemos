'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TriangleAlert, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (input?: string) => void;
    onCancel: () => void;
    showInput?: boolean;
    inputValue?: string;
    placeholder?: string;
    type?: 'danger' | 'info';
    isDarkMode?: boolean;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    showInput = false,
    inputValue = '',
    placeholder = '',
    type = 'info',
    isDarkMode = true
}: ConfirmModalProps) {
    const [localInput, setLocalInput] = useState(inputValue);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setLocalInput(inputValue);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, inputValue]);

    if (!isVisible && !isOpen) return null;

    return (
        <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300",
            isOpen ? "bg-black/60 backdrop-blur-sm opacity-100" : "bg-black/0 backdrop-blur-none opacity-0 pointer-events-none"
        )}>
            <div
                className="absolute inset-0"
                onClick={onCancel}
            />
            <div className={cn(
                "relative w-full max-w-sm rounded-2xl p-6 shadow-2xl transform transition-all duration-300 scale-100",
                isOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
                isDarkMode
                    ? "bg-ink-surface border border-white/10 text-ink-text-primary"
                    : "bg-white border border-gray-200 text-gray-900"
            )}>
                <button
                    onClick={onCancel}
                    className={cn(
                        "absolute top-4 right-4 p-1 rounded-full transition-colors",
                        isDarkMode ? "hover:bg-white/10 text-ink-text-muted" : "hover:bg-gray-100 text-gray-500"
                    )}
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        {type === 'danger' && (
                            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                                <TriangleAlert size={20} />
                            </div>
                        )}
                        <h3 className="text-xl font-bold">{title}</h3>
                    </div>

                    <p className={cn("text-sm", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        {message}
                    </p>

                    {showInput && (
                        <input
                            type="text"
                            autoFocus
                            value={localInput}
                            onChange={(e) => setLocalInput(e.target.value)}
                            placeholder={placeholder}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onConfirm(localInput);
                                if (e.key === 'Escape') onCancel();
                            }}
                            className={cn(
                                "w-full p-3 rounded-lg border outline-none transition-colors",
                                isDarkMode
                                    ? "bg-black/20 border-white/10 text-white focus:border-violet-500"
                                    : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                            )}
                        />
                    )}

                    <div className="flex gap-3 justify-end mt-2">
                        <button
                            onClick={onCancel}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                isDarkMode ? "hover:bg-white/5 text-gray-300" : "hover:bg-gray-100 text-gray-600"
                            )}
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => onConfirm(showInput ? localInput : undefined)}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg",
                                type === 'danger'
                                    ? "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20"
                                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20"
                            )}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
