'use client';

import { cn } from '@/lib/utils';
import { GitGraph, ArrowRight, CheckCircle2 } from 'lucide-react';

interface WorkflowJourneyProps {
    steps: string[];
    isDarkMode?: boolean;
    className?: string;
    onStepClick?: (step: string, index: number) => void;
}

export default function WorkflowJourney({ steps, isDarkMode = true, className, onStepClick }: WorkflowJourneyProps) {
    if (!steps || steps.length === 0) return null;

    return (
        <div className={cn(
            "w-full rounded-xl border p-4 mb-4",
            isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200",
            className
        )}>
            <div className="flex items-center gap-2 mb-3">
                <div className={cn(
                    "p-1.5 rounded-full",
                    isDarkMode ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-600"
                )}>
                    <GitGraph className="w-4 h-4" />
                </div>
                <h3 className={cn("text-sm font-semibold", isDarkMode ? "text-gray-200" : "text-gray-900")}>
                    Workflow Journey
                </h3>
                <span className={cn("text-xs px-2 py-0.5 rounded-full ml-auto", isDarkMode ? "bg-white/10 text-gray-400" : "bg-gray-100 text-gray-600")}>
                    {steps.length} Steps
                </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-500/20 scrollbar-track-transparent">
                {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-shrink-0 animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${idx * 100}ms` }}>
                        <button
                            onClick={() => onStepClick?.(step, idx)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95",
                                onStepClick ? "cursor-pointer" : "cursor-default",
                                isDarkMode
                                    ? "bg-black/20 border-white/10 text-gray-300 hover:bg-white/5 hover:border-violet-500/30"
                                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-violet-300"
                            )}
                        >
                            <span>{step}</span>
                            {idx === steps.length - 1 && (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                            )}
                        </button>

                        {idx < steps.length - 1 && (
                            <ArrowRight className={cn("w-3 h-3 flex-shrink-0", isDarkMode ? "text-gray-600" : "text-gray-400")} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
