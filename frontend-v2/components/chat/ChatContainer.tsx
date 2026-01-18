'use client';

import { cn } from '@/lib/utils';
import MultimodalMessage from './MultimodalMessage';

interface ChatContainerProps {
    isDarkMode?: boolean;
}

export default function ChatContainer({ isDarkMode = true }: ChatContainerProps) {
    // Placeholder messages matching the aspirational design
    const messages = [
        {
            role: 'user' as const,
            content: "Hey there're it arct and you with reconfluent preer mandiats?",
            timestamp: '10:42 AM'
        },
        {
            role: 'assistant' as const,
            content: "We're you orally solutta me birdey!",
            timestamp: '10:42 AM'
        },
        {
            role: 'user' as const,
            content: "What's new vnce would I that you're exactly?",
            timestamp: '10:43 AM'
        },
        {
            role: 'assistant' as const,
            content: "You're will wunderssurd it up within the song.",
            timestamp: '10:43 AM'
        },
    ];

    return (
        <div className={cn(
            "h-full overflow-y-auto px-8 py-6",
            // Custom scrollbar styling
            "[&::-webkit-scrollbar]:w-2",
            isDarkMode
                ? "[&::-webkit-scrollbar-track]:bg-transparent"
                : "[&::-webkit-scrollbar-track]:bg-gray-50",
            isDarkMode
                ? "[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:hover:bg-white/20"
                : "[&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:hover:bg-gray-400",
            "[&::-webkit-scrollbar-thumb]:rounded-full"
        )}>
            <div className="max-w-4xl mx-auto">
                {messages.map((msg, idx) => (
                    <MultimodalMessage
                        key={idx}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.timestamp}
                        isDarkMode={isDarkMode}
                    />
                ))}
            </div>
        </div>
    );
}
