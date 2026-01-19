'use client';

import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import { useSessionStats } from '@/lib/hooks/useSessionStats';

interface InsightPanelProps {
    className?: string;
    isDarkMode?: boolean;
}

export default function InsightPanel({ className, isDarkMode = true }: InsightPanelProps) {
    const { messages } = useApp();
    const { formattedDuration, inputTokens, outputTokens, cost, formatCost, formatTokens } = useSessionStats();

    // Calculate average sentiment from messages
    const messagesWithSentiment = messages.filter(m => m.sentiment !== undefined && !isNaN(m.sentiment));
    const averageSentiment = messagesWithSentiment.length > 0
        ? messagesWithSentiment.reduce((sum, m) => sum + (m.sentiment || 0), 0) / messagesWithSentiment.length
        : 0.5; // Default to neutral (0.5) if no sentiment data

    // Convert sentiment to percentage (0-1 to 0-100)
    const sentimentPercentage = (averageSentiment * 100).toFixed(0);

    // Calculate sentiment label
    const getSentimentLabel = (sentiment: number): string => {
        if (sentiment >= 0.6) return 'Positive';
        if (sentiment >= 0.4) return 'Neutral';
        return 'Negative';
    };

    // Calculate stroke dashoffset for circular progress (352 = circumference of circle with r=56)
    const circumference = 352;
    const sentimentOffset = circumference - (averageSentiment * circumference);

    return (
        <aside className={cn(
            "w-80 flex flex-col gap-6 p-6 border-l transition-colors duration-300",
            isDarkMode ? "bg-ink-surface border-white/8" : "bg-gray-50 border-gray-200",
            className
        )}>
            <div className={cn(
                "text-metadata transition-colors duration-300",
                isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
            )}>Live Session Data</div>

            {/* Sentiment Gauge */}
            <div className={cn(
                "p-6 rounded-xl transition-colors duration-300",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "text-metadata mb-4 transition-colors duration-300",
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
                            <div className="text-xs text-sentiment-neutral font-semibold">
                                {getSentimentLabel(averageSentiment)}
                            </div>
                            <div className={cn(
                                "text-2xl font-bold transition-colors duration-300",
                                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                            )}>{sentimentPercentage}%</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Rank - 2x2 Grid */}
            <div className={cn(
                "p-6 rounded-xl transition-colors duration-300",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "text-metadata mb-4 transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                )}>Stats rank</div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Sentiment</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{sentimentPercentage}%</div>
                    </div>
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Turns</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{messages.length}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Cost</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatCost(cost)}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Input Tokens</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatTokens(inputTokens)}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Output Tokens</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>{formatTokens(outputTokens)}</div>
                    </div>
                    <div>
                        <div className={cn(
                            "text-metadata mb-1 transition-colors duration-300",
                            isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                        )}>Latency</div>
                        <div className={cn(
                            "text-xl font-semibold transition-colors duration-300",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>--</div>
                    </div>
                </div>
            </div>

            {/* Session Duration */}
            <div className={cn(
                "p-6 rounded-xl transition-colors duration-300",
                isDarkMode ? "bg-ink-surface/50" : "bg-white border border-gray-200"
            )}>
                <div className={cn(
                    "text-metadata mb-2 transition-colors duration-300",
                    isDarkMode ? "text-ink-text-muted" : "!text-gray-600"
                )}>Session Duration</div>
                <div className={cn(
                    "text-3xl font-bold transition-colors duration-300",
                    isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                )}>{formattedDuration}</div>
                <div className="mt-4 flex items-center gap-2">
                    <div className={cn(
                        "flex-1 h-1 rounded-full overflow-hidden transition-colors duration-300",
                        isDarkMode ? "bg-white/10" : "bg-gray-200"
                    )}>
                        <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 w-0 transition-all duration-300"></div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
