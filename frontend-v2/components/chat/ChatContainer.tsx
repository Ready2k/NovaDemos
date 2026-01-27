'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/context/AppContext';
import MultimodalMessage from './MultimodalMessage';
import { format } from 'date-fns';

interface ChatContainerProps {
    isDarkMode?: boolean;
}

export default function ChatContainer({ isDarkMode = true }: ChatContainerProps) {
    const { messages } = useApp();
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages]);

    // Format timestamp
    const formatTimestamp = (timestamp: string | number): string => {
        try {
            return format(new Date(timestamp), 'h:mm a');
        } catch {
            return String(timestamp);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "h-full overflow-y-auto px-8 py-6",
                // Custom scrollbar styling
                "[&::-webkit-scrollbar]:w-2",
                isDarkMode
                    ? "bg-transparent"
                    : "bg-gray-50",
                isDarkMode
                    ? "[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:hover:bg-white/20"
                    : "[&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:hover:bg-gray-400",
                "[&::-webkit-scrollbar-thumb]:rounded-full"
            )}
        >
            <div className="max-w-4xl mx-auto">
                {messages.length === 0 ? (
                    // Empty state
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                        <div className={cn(
                            "text-6xl mb-4",
                            isDarkMode ? "opacity-20" : "opacity-30"
                        )}>
                            💬
                        </div>
                        <h3 className={cn(
                            "text-lg font-semibold mb-2",
                            isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                        )}>
                            No messages yet
                        </h3>
                        <p className={cn(
                            "text-sm",
                            isDarkMode ? "text-ink-text-muted" : "text-gray-600"
                        )}>
                            Start a conversation by typing a message or using your microphone
                        </p>
                    </div>
                ) : (
                    // Messages
                    messages.map((msg, idx) => (
                        <MultimodalMessage
                            key={idx}
                            role={msg.role}
                            type={msg.type}
                            content={msg.content}
                            timestamp={formatTimestamp(msg.timestamp)}
                            isDarkMode={isDarkMode}
                            sentiment={msg.sentiment}
                            feedback={msg.feedback}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
