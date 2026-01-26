import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
// Replaced lucide-react import with inline SVG

interface SessionSurveyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSendFeedback?: (score: number, comment?: string) => void;
    isDarkMode?: boolean;
}

export default function SessionSurveyModal({ isOpen, onClose, onSendFeedback, isDarkMode = true }: SessionSurveyModalProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const handleFeedback = (rating: 'up' | 'down') => {
        // Send to backend
        const score = rating === 'up' ? 1 : 0;
        console.log(`[Survey] User feedback: ${rating} (${score})`);

        if (onSendFeedback) {
            onSendFeedback(score);
        }

        onClose();
    };

    return (
        <div className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300",
            isOpen ? "bg-black/60 backdrop-blur-sm opacity-100" : "bg-black/0 backdrop-blur-none opacity-0 pointer-events-none"
        )}>
            <div className={cn(
                "relative w-full max-w-sm rounded-2xl p-6 shadow-2xl transform transition-all duration-300 scale-100",
                isOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
                isDarkMode
                    ? "bg-ink-surface border border-white/10 text-ink-text-primary"
                    : "bg-white border border-gray-200 text-gray-900"
            )}>
                <button
                    onClick={onClose}
                    className={cn(
                        "absolute top-4 right-4 p-1 rounded-full transition-colors",
                        isDarkMode ? "hover:bg-white/10 text-ink-text-muted" : "hover:bg-gray-100 text-gray-500"
                    )}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div className="text-center space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-xl font-semibold">Session Ended</h3>
                        <p className={cn("text-sm", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            How was your experience with Nova Sonic?
                        </p>
                    </div>

                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => handleFeedback('down')}
                            className={cn(
                                "flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 w-24 border",
                                isDarkMode
                                    ? "bg-white/5 border-white/10 hover:bg-rose-500/20 hover:border-rose-500/50 hover:text-rose-400"
                                    : "bg-gray-50 border-gray-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                            )}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                            </svg>
                            <span className="text-xs font-medium">Bad</span>
                        </button>

                        <button
                            onClick={() => handleFeedback('up')}
                            className={cn(
                                "flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 w-24 border",
                                isDarkMode
                                    ? "bg-white/5 border-white/10 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-emerald-400"
                                    : "bg-gray-50 border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                            )}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                            </svg>
                            <span className="text-xs font-medium">Good</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
