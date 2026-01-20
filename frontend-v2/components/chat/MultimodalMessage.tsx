import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface MultimodalMessageProps {
    role: 'user' | 'assistant';
    content: string | ReactNode;
    timestamp?: string;
    media?: ReactNode;
    isDarkMode?: boolean;
    sentiment?: number;
    feedback?: 'up' | 'down';
}

export default function MultimodalMessage({ role, content, timestamp, media, isDarkMode = true, sentiment, feedback }: MultimodalMessageProps) {
    const avatar = role === 'user' ? '👤' : '🤖';
    const name = role === 'user' ? 'User' : 'Agent';

    return (
        <div className={cn(
            "group relative py-3 px-0 flex",
            role === 'user' && "justify-end",
            role === 'assistant' && "justify-start"
        )}>
            <div className={cn(
                "flex gap-3 items-start max-w-[70%]",
                role === 'user' && "flex-row-reverse"
            )}>
                {/* Avatar */}
                <div className={cn(
                    "w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors duration-300",
                    isDarkMode ? "bg-white/10 border-white/8" : "bg-gray-200 border-gray-300"
                )}>
                    <span className="text-sm">{avatar}</span>
                </div>

                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className={cn(
                        "flex items-baseline gap-2 mb-1",
                        role === 'user' && "justify-end"
                    )}>
                        <span className={cn(
                            "text-xs font-medium transition-colors duration-300",
                            isDarkMode ? "text-ink-text-secondary" : "text-gray-600"
                        )}>{name}</span>
                        {timestamp && (
                            <span className={cn(
                                "text-[10px] opacity-50 transition-colors duration-300",
                                isDarkMode ? "text-ink-text-muted" : "text-gray-500"
                            )}>{timestamp}</span>
                        )}
                    </div>

                    {/* Content */}
                    <div className={cn(
                        "px-4 py-2.5 rounded-2xl border transition-colors duration-300",
                        role === 'user' && isDarkMode && "bg-violet-600/30 border-violet-500/20",
                        role === 'user' && !isDarkMode && "bg-violet-100 border-violet-200",
                        role === 'assistant' && isDarkMode && "bg-white/5 border-white/10",
                        role === 'assistant' && !isDarkMode && "bg-gray-100 border-gray-200"
                    )}>
                        {typeof content === 'string' ? (
                            <p className={cn(
                                "text-sm leading-relaxed whitespace-pre-wrap transition-colors duration-300",
                                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                            )}>
                                {content}
                            </p>
                        ) : (
                            <div>{content}</div>
                        )}
                    </div>

                    {/* Media (if present) */}
                    {media && (
                        <div className={cn(
                            "mt-3 rounded-lg overflow-hidden border p-4 transition-colors duration-300",
                            isDarkMode ? "border-white/8 bg-ink-surface" : "border-gray-200 bg-gray-50"
                        )}>
                            {media}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
