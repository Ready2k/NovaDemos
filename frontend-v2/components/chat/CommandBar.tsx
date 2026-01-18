'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CommandBarProps {
    status: 'disconnected' | 'connecting' | 'connected' | 'recording';
    isDarkMode?: boolean;
}

export default function CommandBar({ status, isDarkMode = true }: CommandBarProps) {
    const [message, setMessage] = useState('');
    const [isRecording, setIsRecording] = useState(false);

    // These handlers are now placeholders as onSendMessage/onToggleRecording props are removed.
    // The user's instruction implies these functions might be handled differently or removed later.
    // For now, I'll keep them but they won't do anything without the props.
    const handleSend = () => {
        if (message.trim()) {
            // onSendMessage(message); // onSendMessage prop is removed
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
        setIsRecording(!isRecording);
        // onToggleRecording?.(); // onToggleRecording prop is removed
    };

    const getStatusColor = () => {
        switch (status) {
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
        switch (status) {
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
                    className={cn(
                        "flex-1 bg-transparent border-none focus:outline-none text-sm transition-colors duration-300",
                        isDarkMode
                            ? "text-ink-text-primary placeholder:text-ink-text-muted"
                            : "text-gray-900 placeholder:text-gray-400"
                    )}
                    placeholder="Type a message..."
                />

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={!message.trim()}
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
                    className={cn(
                        "w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg hover:shadow-xl transition-all flex items-center justify-center relative",
                        isRecording && "animate-pulse-mic"
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

                {/* Status Badge - Just the indicator */}
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border transition-colors duration-300",
                    isDarkMode
                        ? "bg-white/5 border-white/8"
                        : "bg-gray-50 border-gray-200"
                )}
                    title={getStatusLabel()}
                >
                    <div className={cn("w-2 h-2 rounded-full", getStatusColor())}></div>
                </div>
            </div>
        </div>
    );
}
