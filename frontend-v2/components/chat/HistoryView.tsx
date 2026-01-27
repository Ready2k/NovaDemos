'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import MultimodalMessage from './MultimodalMessage';
import { Message } from '@/lib/types';
import { format } from 'date-fns';
import { ChevronLeft, Calendar, MessageSquare, Clock } from 'lucide-react';
import WorkflowJourney from './WorkflowJourney';

interface HistoryFile {
    id: string;
    date: number; // timestamp
    summary: string;
    totalMessages: number;
    finalMessages: number;
    transcript?: Message[];
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        cost?: number;
        sentiment?: number;
    };
    feedback?: {
        score: number;
        comment?: string;
    };
}

interface HistoryViewProps {
    className?: string;
}

export default function HistoryView({ className }: HistoryViewProps) {
    const { isDarkMode } = useApp();
    const [historyFiles, setHistoryFiles] = useState<HistoryFile[]>([]);
    const [selectedSession, setSelectedSession] = useState<HistoryFile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch history list on mount
    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/history');
            if (!res.ok) throw new Error('Failed to fetch history');
            const data = await res.json();
            setHistoryFiles(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSessionDetail = async (filename: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/history/${filename}`);
            if (!res.ok) throw new Error('Failed to fetch session detail');
            const data = await res.json();
            // Data is the full session object, we need to map it to our HistoryFile/Message structure
            // effectively just need the transcript
            setSelectedSession({
                id: filename,
                date: data.startTime,
                summary: `Session ${data.sessionId?.substring(0, 8)}`,
                totalMessages: data.transcript?.length || 0,
                finalMessages: 0,
                usage: data.usage,
                feedback: data.feedback,
                transcript: data.transcript?.map((msg: any) => ({
                    ...msg,
                    content: msg.content || msg.text, // Handle both content and text fields
                    type: msg.type
                }))
            });
        } catch (err: any) {
            console.error('Error fetching session:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (ts: number | string) => {
        try {
            return format(new Date(ts), 'MMM d, h:mm a');
        } catch {
            return 'Unknown Date';
        }
    };

    const [showFinalOnly, setShowFinalOnly] = useState(false);

    // --- Render: Detail View ---
    if (selectedSession && selectedSession.transcript) {
        const displayedMessages = showFinalOnly
            ? selectedSession.transcript.filter(m => m.role === 'user' || m.type === 'final')
            : selectedSession.transcript;

        return (
            <div className={cn("flex flex-col h-full", className)}>
                {/* Header */}
                <div className={cn(
                    "flex items-center justify-between p-4 border-b shrink-0",
                    isDarkMode ? "border-white/10" : "border-gray-200"
                )}>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSelectedSession(null)}
                            className={cn(
                                "p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium",
                                isDarkMode
                                    ? "hover:bg-white/10 text-gray-300"
                                    : "hover:bg-gray-100 text-gray-600"
                            )}
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                        <div>
                            <h2 className={cn("font-semibold text-lg", isDarkMode ? "text-white" : "text-gray-900")}>
                                {formatTime(selectedSession.date)}
                            </h2>
                            <div className="text-xs text-gray-500">
                                {selectedSession.summary} • {selectedSession.transcript.length} messages
                            </div>
                        </div>
                    </div>

                    <label className={cn(
                        "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer select-none transition-colors",
                        showFinalOnly
                            ? "bg-violet-600 border-violet-600 text-white"
                            : isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600"
                    )}>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={showFinalOnly}
                            onChange={e => setShowFinalOnly(e.target.checked)}
                        />
                        <span>Show Final Only</span>
                    </label>
                </div>

                {/* Workflow Journey Visualization */}
                {(() => {
                    const workflowSteps = selectedSession.transcript
                        .filter(m => m.role === 'system' && m.type === 'workflow_step')
                        // Extract step ID from metadata or text
                        .map(m => {
                            if (m.metadata?.stepId) return m.metadata.stepId;
                            // Fallback invalid parsing
                            const match = (m.content as string).match(/Active Workflow Step: (.*)/);
                            return match ? match[1] : null;
                        })
                        .filter(Boolean) as string[];

                    if (workflowSteps.length > 0) {
                        return (
                            <div className="px-8 pt-6 pb-0 max-w-4xl mx-auto w-full">
                                <WorkflowJourney steps={workflowSteps} isDarkMode={isDarkMode} />
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* Transcript */}
                <div className={cn(
                    "flex-1 overflow-y-auto px-8 py-6",
                    // Scrollbar styling
                    "[&::-webkit-scrollbar]:w-2",
                    isDarkMode
                        ? "[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10"
                        : "[&::-webkit-scrollbar-track]:bg-gray-50 [&::-webkit-scrollbar-thumb]:bg-gray-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full"
                )}>
                    <div className="max-w-4xl mx-auto flex flex-col gap-4">
                        {displayedMessages.map((msg, idx) => (
                            <MultimodalMessage
                                key={idx}
                                role={msg.role}
                                type={msg.type}
                                content={msg.content}
                                timestamp={msg.timestamp ? format(new Date(msg.timestamp), 'h:mm a') : ''}
                                isDarkMode={isDarkMode}
                                sentiment={msg.sentiment}
                                feedback={msg.feedback}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // --- Render: List View ---
    return (
        <div className={cn("flex flex-col h-full p-6", className)}>
            <div className="flex items-center justify-between mb-6">
                <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                    Chat History
                </h1>
                <button
                    onClick={fetchHistory}
                    className={cn("p-2 rounded-full", isDarkMode ? "hover:bg-white/10" : "hover:bg-gray-100")}
                    title="Refresh"
                >
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {isLoading && !historyFiles.length ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    Loading history...
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center text-red-500">
                    {error}
                </div>
            ) : historyFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
                    <div className="text-4xl">📂</div>
                    <p>No chat history found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-4">
                    {historyFiles.map((file) => (
                        <button
                            key={file.id}
                            onClick={() => fetchSessionDetail(file.id)}
                            className={cn(
                                "flex flex-col gap-3 p-4 rounded-xl border text-left transition-all hover:scale-[1.02]",
                                isDarkMode
                                    ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-violet-500/30"
                                    : "bg-white border-gray-200 hover:border-violet-300 shadow-sm hover:shadow-md"
                            )}
                        >
                            <div className="flex items-start justify-between w-full">
                                <div className={cn("p-2 rounded-lg", isDarkMode ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-600")}>
                                    <MessageSquare className="w-5 h-5" />
                                </div>
                                <span className={cn("text-xs font-medium px-2 py-1 rounded-full",
                                    isDarkMode ? "bg-white/10 text-gray-400" : "bg-gray-100 text-gray-600"
                                )}>
                                    {file.totalMessages} msgs
                                </span>
                            </div>

                            <div>
                                <h3 className={cn("font-medium block mb-1", isDarkMode ? "text-gray-200" : "text-gray-900")}>
                                    {formatTime(file.date)}
                                </h3>
                                <p className="text-xs text-gray-500 line-clamp-2">
                                    {file.summary.replace(/Session [a-z0-9-]+ - /, '')}
                                </p>
                            </div>

                            <div className="mt-auto pt-3 grid grid-cols-2 gap-y-2 text-[10px] text-gray-500 border-t border-gray-500/10 w-full">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    <span>{format(new Date(file.date), 'h:mm a')}</span>
                                </div>
                                {file.usage && (
                                    <div className="flex items-center gap-1.5 justify-end">
                                        {file.usage.sentiment !== undefined && (
                                            <span className={cn(
                                                "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                                file.usage.sentiment > 0.1 ? "bg-green-500/10 text-green-400" :
                                                    file.usage.sentiment < -0.1 ? "bg-red-500/10 text-red-400" :
                                                        "bg-gray-500/10 text-gray-400"
                                            )}>
                                                {((file.usage.sentiment + 1) * 50).toFixed(0)}% Senti
                                            </span>
                                        )}
                                        <span className="font-medium text-violet-400 ml-1">
                                            ${((file.usage.cost || 0) > 0 ? file.usage.cost! : 0).toFixed(3)}
                                        </span>
                                    </div>
                                )}
                                {file.usage && (
                                    <div className="flex items-center gap-1.5 col-span-2 text-[9px] opacity-70">
                                        <span>In: {(file.usage.inputTokens || 0).toLocaleString()}</span>
                                        <span>•</span>
                                        <span>Out: {(file.usage.outputTokens || 0).toLocaleString()}</span>
                                    </div>
                                )}
                                {file.feedback && (
                                    <div className="col-span-2 flex items-center gap-1.5 mt-1">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                            file.feedback.score > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                        )}>
                                            {file.feedback.score > 0 ? '👍 Positive' : '👎 Negative'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
