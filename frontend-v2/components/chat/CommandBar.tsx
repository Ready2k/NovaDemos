'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';

interface CommandBarProps {
    status: 'disconnected' | 'connecting' | 'connected' | 'recording';
    isDarkMode?: boolean;
    onSendMessage?: (message: string) => void;
    onToggleRecording?: () => void;
    onToggleConnection?: () => void;
}

export default function CommandBar({ status, isDarkMode = true, onSendMessage, onToggleRecording, onToggleConnection }: CommandBarProps) {
    const { connectionStatus } = useApp();
    const [message, setMessage] = useState('');

    // Use prop status if provided, otherwise use global status
    const currentStatus = status || connectionStatus;
    const isRecording = currentStatus === 'recording';

    const handleSend = () => {
        console.log('[CommandBar] handleSend called, message:', message);
        console.log('[CommandBar] onSendMessage exists:', !!onSendMessage);
        if (message.trim() && onSendMessage) {
            onSendMessage(message);
            setMessage('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleMicClick = () => {
        if (onToggleRecording) {
            onToggleRecording();
        }
    };

    const getStatusColor = () => {
        switch (currentStatus) {
            case 'connected':
            case 'recording':
                return 'bg-emerald-500';
            case 'connecting':
                return 'bg-yellow-500';
            case 'disconnected':
                return 'bg-rose-500';
            default:
                return 'bg-ink-text-muted';
        }
    };

    const getStatusLabel = () => {
        switch (currentStatus) {
            case 'connected':
                return 'Connected';
            case 'recording':
                return 'Recording';
            case 'connecting':
                return 'Connecting...';
            case 'disconnected':
                return 'Disconnected';
            default:
                return 'Unknown';
        }
    };

    const isDisabled = currentStatus === 'disconnected' || currentStatus === 'connecting';

    return (
        <div className="px-8 py-6">
            <div className={cn(
                "max-w-3xl mx-auto p-4 flex items-center gap-4 rounded-xl border transition-all duration-300",
                isDarkMode
                    ? "bg-white/5 backdrop-blur-xl border-white/10"
                    : "bg-white border-gray-200 shadow-lg"
            )}>
                {/* Text Input */}
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                    className={cn(
                        "flex-1 bg-transparent border-none focus:outline-none text-sm transition-colors duration-300",
                        isDarkMode
                            ? "text-ink-text-primary placeholder:text-ink-text-muted"
                            : "text-gray-900 placeholder:text-gray-400",
                        isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                    placeholder={isDisabled ? "Connect to start chatting..." : "Type a message..."}
                />

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={!message.trim() || isDisabled}
                    className={cn(
                        "w-10 h-10 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center",
                        isDarkMode
                            ? "bg-white/10 hover:bg-white/20 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    )}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                </button>

                {/* Mic Button */}
                <button
                    onClick={handleMicClick}
                    disabled={isDisabled}
                    className={cn(
                        "w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg hover:shadow-xl transition-all flex items-center justify-center relative",
                        isRecording && "animate-pulse-mic",
                        isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {isRecording ? (
                        <div className="w-4 h-4 bg-white rounded-sm"></div>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                    )}
                    {isRecording && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-pulse"></span>
                    )}
                </button>

                {/* Power Button (Connection Toggle) */}
                <button
                    onClick={onToggleConnection}
                    className={cn(
                        "w-12 h-12 rounded-full border transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl relative overflow-hidden group",
                        // Dynamic Colors based on status
                        currentStatus === 'connected' || currentStatus === 'recording'
                            ? (isDarkMode ? "bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30" : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100")
                            : currentStatus === 'connecting'
                                ? (isDarkMode ? "bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30" : "bg-yellow-50 border-yellow-200 hover:bg-yellow-100")
                                : (isDarkMode ? "bg-rose-500/20 border-rose-500/50 hover:bg-rose-500/30" : "bg-rose-50 border-rose-200 hover:bg-rose-100")
                    )}
                    title={isDisabled ? "Click to Connect" : "Click to Disconnect"}
                >
                    {/* Icon changes based on status */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={cn("transition-colors duration-300",
                            currentStatus === 'connected' || currentStatus === 'recording'
                                ? "text-emerald-500"
                                : currentStatus === 'connecting'
                                    ? "text-yellow-500 animate-pulse"
                                    : "text-rose-500"
                        )}
                    >
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                        <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>

                    {/* Ring glow effect for active state */}
                    {(currentStatus === 'connected' || currentStatus === 'recording') && (
                        <span className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping opacity-20"></span>
                    )}
                </button>
            </div>
        </div>
    );
}
