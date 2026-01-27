import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { GitGraph } from 'lucide-react';

interface MultimodalMessageProps {
    role: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'tool' | 'system';
    type?: string;
    content: string | ReactNode;
    timestamp?: string;
    media?: ReactNode;
    isDarkMode?: boolean;
    sentiment?: number;
    feedback?: 'up' | 'down';
    id?: string;
}

export default function MultimodalMessage(props: MultimodalMessageProps) {
    const { role, content, timestamp, media, isDarkMode = true, sentiment, feedback, id } = props;
    const avatar = role === 'user' ? '👤' : (role === 'assistant' ? '🤖' : '🔧');
    const name = role === 'user' ? 'User' : (role === 'assistant' ? 'Agent' : 'System (Tool)');

    const isTool = role === 'tool_use' || role === 'tool_result' || (role as string) === 'tool';
    const isWorkflowStep = role === 'system' && (props.type === 'workflow_step');

    // Workflow Step Visualization
    if (isWorkflowStep) {
        return (
            <div id={id} className="flex justify-center my-4 opacity-80 hover:opacity-100 transition-opacity scroll-mt-24">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm",
                    isDarkMode
                        ? "bg-violet-900/20 border-violet-500/20 text-violet-300"
                        : "bg-violet-50 border-violet-200 text-violet-700"
                )}>
                    <GitGraph className="w-3 h-3" />
                    <span>{content}</span>
                </div>
            </div>
        );
    }

    return (
        <div id={id} className={cn(
            "group relative py-3 px-0 flex scroll-mt-24",
            role === 'user' && "justify-end",
            (role === 'assistant' || isTool) && "justify-start"
        )}>
            <div className={cn(
                "flex gap-3 items-start max-w-[85%]", // Increased width for tool details
                role === 'user' && "flex-row-reverse"
            )}>
                {/* Avatar */}
                <div className={cn(
                    "w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors duration-300",
                    isDarkMode ? "bg-white/10 border-white/8" : "bg-gray-200 border-gray-300",
                    isTool && (isDarkMode ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "bg-amber-100 border-amber-200 text-amber-600")
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
                            isDarkMode ? "text-ink-text-secondary" : "text-gray-600",
                            isTool && "text-amber-500/80"
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
                        role === 'assistant' && !isDarkMode && "bg-gray-100 border-gray-200",
                        isTool && (isDarkMode ? "bg-amber-500/5 border-amber-500/10 font-mono text-[11px]" : "bg-amber-50 border-amber-100 font-mono text-[11px]")
                    )}>
                        {typeof content === 'string' ? (
                            <div className={cn(
                                "text-sm leading-relaxed whitespace-pre-wrap transition-colors duration-300",
                                isDarkMode ? "text-ink-text-primary" : "text-gray-900"
                            )}>
                                {content.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence, i) => {
                                    // Fix currency spacing: "£1,200. 00" -> "£1,200.00"
                                    const cleanSentence = sentence.replace(/(£|\$|€)(\d+(?:,\d+)*)\.\s+(\d{2})/g, "$1$2.$3");
                                    // Also fix if the split happened inside a bad currency format initially, though the lookbehind should prevent that if it was "00". 
                                    // Actually, "1,200. 00" -> The split regex looks for capital letter. "0" is not capital. So it shouldn't split the currency.

                                    return (
                                        <p key={i} className={i > 0 ? "mt-2" : ""}>
                                            {cleanSentence}
                                        </p>
                                    );
                                })}
                            </div>
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
