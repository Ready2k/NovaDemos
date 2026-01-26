'use client';

import React from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';

export default function AboutModal() {
    const { isAboutModalOpen, setIsAboutModalOpen, isDarkMode } = useApp();

    if (!isAboutModalOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={() => setIsAboutModalOpen(false)}
            />

            {/* Modal Content */}
            <div className={cn(
                "relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300 transform scale-100 flex flex-col",
                isDarkMode
                    ? "bg-ink-surface border-white/10 text-white"
                    : "bg-white border-gray-200 text-gray-900"
            )}>
                {/* Header */}
                <div className={cn(
                    "px-8 py-6 border-b flex items-center justify-between",
                    isDarkMode ? "border-white/10" : "border-gray-100"
                )}>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">A</div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Voice S2S</h2>
                            <p className={cn(
                                "text-xs font-medium uppercase tracking-widest opacity-60",
                                isDarkMode ? "text-violet-300" : "text-violet-600"
                            )}>Version 2.0.0 "Nova Sonic"</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAboutModalOpen(false)}
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                            isDarkMode ? "hover:bg-white/10 text-white/60" : "hover:bg-gray-100 text-gray-400"
                        )}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar">
                    <section>
                        <h3 className={cn(
                            "text-sm font-semibold uppercase tracking-wider mb-3 opacity-80",
                            isDarkMode ? "text-violet-400" : "text-violet-600"
                        )}>System Specification</h3>
                        <p className="text-sm leading-relaxed opacity-90">
                            A comprehensive, production-ready real-time speech-to-speech interaction platform powered by Amazon Nova 2 Sonic.
                            Built with a high-performance WebSocket backend and a modern React frontend, it features bidirectional binary audio streaming,
                            sub-500ms latency, and enterprise-grade tool execution capabilities.
                        </p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section>
                            <h3 className={cn(
                                "text-xs font-semibold uppercase tracking-wider mb-2 opacity-60",
                                isDarkMode ? "text-white" : "text-gray-900"
                            )}>Core Technologies</h3>
                            <ul className="text-sm space-y-1.5 list-disc list-inside opacity-80">
                                <li>Amazon Nova 2 Sonic (V1)</li>
                                <li>AWS Bedrock Agent Runtime</li>
                                <li>Next.js 15 & React 19</li>
                                <li>Typed WebSocket Protocol</li>
                                <li>Langfuse Observability</li>
                            </ul>
                        </section>
                        <section>
                            <h3 className={cn(
                                "text-xs font-semibold uppercase tracking-wider mb-2 opacity-60",
                                isDarkMode ? "text-white" : "text-gray-900"
                            )}>Key Capabilities</h3>
                            <ul className="text-sm space-y-1.5 list-disc list-inside opacity-80">
                                <li>Real-time S2S (&lt;500ms)</li>
                                <li>Advanced Tool Calling</li>
                                <li>Sentiment-Aware Interaction</li>
                                <li>Workflow-Driven Personas</li>
                                <li>Enterprise Banking Suite</li>
                            </ul>
                        </section>
                    </div>

                    <section className={cn(
                        "p-4 rounded-xl border",
                        isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"
                    )}>
                        <h3 className="text-sm font-semibold mb-2">Developed for Advanced Agentic Coding</h3>
                        <p className="text-xs leading-relaxed opacity-70">
                            This application serves as a benchmark for real-time AI interactions and agentic tool use.
                            It implements state-of-the-art patterns for audio processing and human-AI collaboration.
                        </p>
                    </section>
                </div>

                {/* Footer */}
                <div className={cn(
                    "px-8 py-4 border-t flex items-center justify-center text-[10px] uppercase tracking-widest font-bold opacity-40",
                    isDarkMode ? "border-white/10" : "border-gray-100"
                )}>
                    © 2026 Archdemos AI Team
                </div>
            </div>
        </div>
    );
}
