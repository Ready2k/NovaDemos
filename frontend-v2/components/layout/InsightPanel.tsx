'use client';

import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import { useSessionStats } from '@/lib/hooks/useSessionStats';
import { analyzeSentiment } from '@/lib/sentiment';
import { useMemo, useState } from 'react';

interface InsightPanelProps {
    className?: string;
    isDarkMode?: boolean;
}

import WorkflowVisualizer from '../chat/WorkflowVisualizer';

function StatRow({
    label,
    value,
    sub,
    isDarkMode,
}: {
    label: string;
    value: string | React.ReactNode;
    sub?: string;
    isDarkMode: boolean;
}) {
    return (
        <div>
            <div className={cn(
                "uppercase tracking-wider font-semibold text-[10px] mb-0.5 transition-colors duration-300",
                isDarkMode ? "text-ink-text-muted" : "!text-gray-500"
            )}>{label}</div>
            <div className={cn(
                "text-sm font-semibold leading-tight transition-colors duration-300",
                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
            )}>{value}</div>
            {sub && (
                <div className={cn(
                    "text-[10px] transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "text-gray-400"
                )}>{sub}</div>
            )}
        </div>
    );
}

function formatMs(ms?: number): string {
    if (ms === undefined || ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export default function InsightPanel({ className, isDarkMode = true }: InsightPanelProps) {
    const { messages, currentSession } = useApp();
    const { formattedDuration, inputTokens, outputTokens, cost, formatCost, formatTokens } = useSessionStats();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const messagesWithSentiment = useMemo(() => {
        return messages.map(m => {
            if (m.sentiment !== undefined && !isNaN(m.sentiment)) {
                return { ...m, sentiment: m.sentiment };
            }
            const analysis = analyzeSentiment(m.content);
            return { ...m, sentiment: analysis.comparative };
        });
    }, [messages]);

    const averageSentiment = messagesWithSentiment.length > 0
        ? messagesWithSentiment.reduce((sum, m) => sum + (m.sentiment || 0), 0) / messagesWithSentiment.length
        : 0;

    const sentimentPercentage = ((averageSentiment + 1) * 50).toFixed(0);

    const getSentimentLabel = (sentiment: number): string => {
        const pct = (sentiment + 1) * 50;
        if (pct >= 70) return 'Positive';
        if (pct >= 30) return 'Neutral';
        return 'Negative';
    };

    // Smaller gauge: w-20 h-20, cx=cy=40, r=32
    const r = 32;
    const circumference = Math.round(2 * Math.PI * r); // ~201
    const sentimentProgress = (averageSentiment + 1) / 2;
    const sentimentOffset = circumference - sentimentProgress * circumference;

    const lastTtft = currentSession?.lastTtft;
    const avgTtft = currentSession?.avgTtft;
    const lastLatency = currentSession?.lastLatency;
    const avgLatency = currentSession?.avgLatency;
    const latencyTurns = currentSession?.latencyTurns || 0;

    if (isCollapsed) {
        return (
            <aside className={cn(
                "flex flex-col items-center py-4 border-l transition-colors duration-300",
                isDarkMode ? "bg-ink-surface border-white/8" : "bg-gray-50 border-gray-200",
                className
            )} style={{ width: '40px' }}>
                <button
                    onClick={() => setIsCollapsed(false)}
                    className={cn(
                        "p-1.5 rounded-lg transition-colors duration-200 cursor-pointer",
                        isDarkMode
                            ? "text-ink-text-muted hover:text-ink-text-primary hover:bg-white/8"
                            : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
                    )}
                    title="Expand panel"
                >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <div className={cn(
                    "mt-3 uppercase tracking-wider font-semibold text-[10px] select-none transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "text-gray-400"
                )} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    Live Session Data
                </div>
            </aside>
        );
    }

    return (
        <aside className={cn(
            "w-72 flex flex-col gap-3 p-4 border-l overflow-y-auto transition-colors duration-300",
            isDarkMode ? "bg-ink-surface border-white/8" : "bg-gray-50 border-gray-200",
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className={cn(
                    "uppercase tracking-wider font-semibold text-[11px] transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                )}>Live Session Data</div>
                <button
                    onClick={() => setIsCollapsed(true)}
                    className={cn(
                        "p-1 rounded-lg transition-colors duration-200 cursor-pointer",
                        isDarkMode
                            ? "text-ink-text-muted hover:text-ink-text-primary hover:bg-white/8"
                            : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
                    )}
                    title="Collapse panel"
                >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>

            {/* Workflow */}
            <WorkflowVisualizer layout="col" className="w-full" />

            {/* Sentiment — horizontal layout to save vertical space */}
            <div className={cn(
                "p-3 rounded-xl transition-colors duration-300",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "uppercase tracking-wider font-semibold text-[10px] mb-2 transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-500"
                )}>Sentiment</div>
                <div className="flex items-center gap-4">
                    {/* Smaller gauge: 80×80 */}
                    <div className="relative w-20 h-20 shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
                            <circle
                                cx="40" cy="40" r={r}
                                stroke="url(#sg)"
                                strokeWidth="6"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={sentimentOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500"
                            />
                            <defs>
                                <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8B5CF6" />
                                    <stop offset="100%" stopColor="#06B6D4" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-[9px] text-sentiment-neutral font-semibold leading-none">
                                {getSentimentLabel(averageSentiment)}
                            </div>
                            <div className={cn(
                                "text-base font-bold leading-tight transition-colors duration-300",
                                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                            )}>{sentimentPercentage}%</div>
                        </div>
                    </div>
                    {/* Side labels */}
                    <div className="flex flex-col gap-1">
                        <div className={cn("text-[10px] uppercase tracking-wider font-semibold", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>Score</div>
                        <div className={cn("text-xl font-bold", isDarkMode ? "text-ink-text-primary" : "text-gray-900")}>{sentimentPercentage}%</div>
                        <div className={cn("text-[11px] font-medium", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            {getSentimentLabel(averageSentiment)}
                        </div>
                        <div className={cn("text-[10px]", isDarkMode ? "text-ink-text-muted" : "text-gray-400")}>
                            {messages.length} msg{messages.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Stats */}
            <div className={cn(
                "p-3 rounded-xl transition-colors duration-300 flex flex-col gap-3",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                {/* Duration inline with label */}
                <div className="flex items-baseline justify-between">
                    <div className={cn(
                        "uppercase tracking-wider font-semibold text-[10px] transition-colors duration-300",
                        isDarkMode ? "text-ink-text-muted" : "!text-gray-500"
                    )}>Session Duration</div>
                    <div className={cn(
                        "text-xl font-bold tabular-nums transition-colors duration-300",
                        isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                    )}>{formattedDuration}</div>
                </div>

                <div className={cn("h-px", isDarkMode ? "bg-white/8" : "bg-gray-100")} />

                {/* Stats Grid — tighter gaps */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                    <StatRow
                        label="Language"
                        isDarkMode={isDarkMode}
                        value={
                            currentSession?.detectedLanguage ? (
                                <span title={`Confidence: ${(currentSession.languageConfidence ? (currentSession.languageConfidence * 100).toFixed(0) : '0')}%`}>
                                    {currentSession.detectedLanguage}
                                </span>
                            ) : (
                                <span className="opacity-40 italic text-xs">Detecting…</span>
                            )
                        }
                    />
                    <StatRow label="Sentiment" isDarkMode={isDarkMode} value={`${sentimentPercentage}%`} />
                    <StatRow label="Turns" isDarkMode={isDarkMode} value={String(messages.length)} />
                    <StatRow label="Cost" isDarkMode={isDarkMode} value={formatCost(cost)} />
                    <StatRow label="Input Tokens" isDarkMode={isDarkMode} value={formatTokens(inputTokens)} />
                    <StatRow label="Output Tokens" isDarkMode={isDarkMode} value={formatTokens(outputTokens)} />
                </div>
            </div>

            {/* Performance / Latency */}
            <div className={cn(
                "p-3 rounded-xl transition-colors duration-300 flex flex-col gap-3",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "uppercase tracking-wider font-semibold text-[10px] transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-500"
                )}>Performance</div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                    <StatRow
                        label="TTFT"
                        isDarkMode={isDarkMode}
                        value={formatMs(lastTtft)}
                        sub={latencyTurns > 1 ? `avg ${formatMs(avgTtft)}` : undefined}
                    />
                    <StatRow
                        label="Latency"
                        isDarkMode={isDarkMode}
                        value={formatMs(lastLatency)}
                        sub={latencyTurns > 1 ? `avg ${formatMs(avgLatency)}` : undefined}
                    />
                    <StatRow
                        label="Measured Turns"
                        isDarkMode={isDarkMode}
                        value={String(latencyTurns)}
                    />
                    <StatRow
                        label="Turns / Min"
                        isDarkMode={isDarkMode}
                        value={(() => {
                            if (!currentSession?.startTime || messages.length === 0) return '—';
                            const elapsed = (Date.now() - new Date(currentSession.startTime).getTime()) / 60000;
                            if (elapsed < 0.1) return '—';
                            return (messages.length / elapsed).toFixed(1);
                        })()}
                    />
                </div>
            </div>
        </aside>
    );
}
