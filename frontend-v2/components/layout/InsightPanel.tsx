'use client';

import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import { useSessionStats } from '@/lib/hooks/useSessionStats';
import { analyzeSentiment } from '@/lib/sentiment';
import { useMemo } from 'react';

interface InsightPanelProps {
    className?: string;
    isDarkMode?: boolean;
}

import WorkflowVisualizer from '../chat/WorkflowVisualizer';

export default function InsightPanel({ className, isDarkMode = true }: InsightPanelProps) {
    const { messages } = useApp();
    const { formattedDuration, inputTokens, outputTokens, cost, formatCost, formatTokens } = useSessionStats();

    // Calculate average sentiment from messages
    // Calculate average sentiment from messages (use useMemo for performance)
    const messagesWithSentiment = useMemo(() => {
        return messages.map(m => {
            // Use existing sentiment if available
            if (m.sentiment !== undefined && !isNaN(m.sentiment)) {
                return { ...m, sentiment: m.sentiment };
            }
            // Fallback to local dictionary analysis
            const analysis = analyzeSentiment(m.content);
            // Use comparative score as it's length-normalized (roughly -1 to 1)
            return { ...m, sentiment: analysis.comparative };
        });
    }, [messages]);

    const averageSentiment = messagesWithSentiment.length > 0
        ? messagesWithSentiment.reduce((sum, m) => sum + (m.sentiment || 0), 0) / messagesWithSentiment.length
        : 0; // Default to neutral (0) if no data

    // Convert sentiment from -1 to +1 scale to 0-100% scale
    // -1 (very negative) = 0%
    //  0 (neutral) = 50%
    // +1 (very positive) = 100%
    const sentimentPercentage = ((averageSentiment + 1) * 50).toFixed(0);

    // Calculate sentiment label based on percentage
    const getSentimentLabel = (sentiment: number): string => {
        const percentage = (sentiment + 1) * 50; // Convert to 0-100 scale
        if (percentage >= 70) return 'Positive';
        if (percentage >= 30) return 'Neutral';
        return 'Negative';
    };

    // Calculate stroke dashoffset for circular progress (352 = circumference of circle with r=56)
    const circumference = 352;
    // Convert sentiment to 0-1 range for progress circle
    const sentimentProgress = (averageSentiment + 1) / 2; // -1 to +1 becomes 0 to 1
    const sentimentOffset = circumference - (sentimentProgress * circumference);

    return (
        <aside className={cn(
            "w-80 flex flex-col gap-6 p-6 border-l transition-colors duration-300",
            isDarkMode ? "bg-ink-surface border-white/8" : "bg-gray-50 border-gray-200",
            className
        )}>
            <div className={cn(
                "uppercase tracking-wider font-semibold text-[11px] transition-colors duration-300",
                isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
            )}>Live Session Data</div>

            {/* Workflow Visualization */}
            <WorkflowVisualizer layout="col" className="w-full" />

            {/* Sentiment Gauge */}
            <div className={cn(
                "p-6 rounded-xl transition-colors duration-300",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "uppercase tracking-wider font-semibold text-[11px] mb-4 transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                )}>Sentiment</div>
                <div className="flex items-center justify-center relative mb-4">
                    {/* Circular Progress */}
                    <div className="relative w-32 h-32">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="8"
                                fill="none"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="url(#sentiment-gradient)"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={sentimentOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500"
                            />
                            <defs>
                                <linearGradient id="sentiment-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8B5CF6" />
                                    <stop offset="100%" stopColor="#06B6D4" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-[10px] text-sentiment-neutral font-semibold">
                                {getSentimentLabel(averageSentiment)}
                            </div>
                            <div className={cn(
                                "text-lg font-bold transition-colors duration-300",
                                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                            )}>{sentimentPercentage}%</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Stats */}
            <div className={cn(
                "p-4 rounded-xl transition-colors duration-300 flex flex-col gap-4",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                {/* Session Duration (Moved to Top) */}
                <div className="flex flex-col">
                    <div className={cn(
                        "uppercase tracking-wider font-semibold text-[11px] mb-1 transition-colors duration-300",
                        isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                    )}>Session Duration</div>
                    <div className={cn(
                        "text-2xl font-bold transition-colors duration-300",
                        isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                    )}>{formattedDuration}</div>
                    <div className="mt-2 flex items-center gap-2">
                        <div className={cn(
                            "flex-1 h-1 rounded-full overflow-hidden transition-colors duration-300",
                            isDarkMode ? "bg-white/10" : "bg-gray-200"
                        )}>
                            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 w-0 transition-all duration-300"></div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-4">
                    <div>
                        <div className={cn(
                            "uppercase tracking-wider font-semibold text-[11px] mb-0.5 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Sentiment</div>
                        <div className={cn(
                            "text-sm font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{sentimentPercentage}%</div>
                    </div>
                    <div>
                        <div className={cn(
                            "uppercase tracking-wider font-semibold text-[11px] mb-0.5 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Turns</div>
                        <div className={cn(
                            "text-sm font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{messages.length}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "uppercase tracking-wider font-semibold text-[11px] mb-0.5 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Cost</div>
                        <div className={cn(
                            "text-sm font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatCost(cost)}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "uppercase tracking-wider font-semibold text-[11px] mb-0.5 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Input Tokens</div>
                        <div className={cn(
                            "text-sm font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatTokens(inputTokens)}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "uppercase tracking-wider font-semibold text-[11px] mb-0.5 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Output Tokens</div>
                        <div className={cn(
                            "text-sm font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatTokens(outputTokens)}</div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
