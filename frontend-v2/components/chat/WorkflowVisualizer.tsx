'use client';

import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { GitGraph, ArrowRight, CheckCircle2 } from 'lucide-react';

interface WorkflowVisualizerProps {
    className?: string;
    layout?: 'row' | 'col';
}

export default function WorkflowVisualizer({ className, layout = 'row' }: WorkflowVisualizerProps) {
    const { workflowState, settings, isDarkMode } = useApp();

    if (!settings.showWorkflowVisualization || !workflowState || workflowState.status === 'idle') {
        return null;
    }

    return (
        <div className={cn(
            "rounded-xl border shadow-sm transition-all duration-500 animate-in fade-in zoom-in-95",
            layout === 'row' ? "flex items-center gap-4 px-4 py-1.5 rounded-full" : "flex flex-col gap-2 p-3 w-full",
            isDarkMode
                ? "bg-ink-surface/80 border-violet-500/30 backdrop-blur-md"
                : "bg-white/80 border-violet-200 backdrop-blur-md",
            className
        )}>
            {/* Status Indicator */}
            <div className={cn(
                "flex items-center gap-2",
                layout === 'row' ? "pr-3 border-r border-violet-500/20" : "w-full pb-2 border-b border-violet-500/20"
            )}>
                <div className={cn(
                    "p-1.5 rounded-full",
                    isDarkMode ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-600"
                )}>
                    <GitGraph className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col flex-1">
                    <span className={cn("text-[9px] font-bold uppercase tracking-wider", isDarkMode ? "text-violet-300" : "text-violet-600")}>
                        {layout === 'row' ? "Workflow Active" : "Active Workflow"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] opacity-70">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                        </span>
                        Live
                    </span>
                </div>
            </div>

            {/* Current Step */}
            <div className={cn(
                "flex items-center gap-2",
                layout === 'row' ? "pl-1" : "justify-between w-full pt-0.5"
            )}>
                <div className={cn("text-[10px] font-medium uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                    Step
                </div>
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded break-all truncate",
                        isDarkMode ? "bg-white/5 text-white" : "bg-black/5 text-gray-900"
                    )}>
                        {workflowState.currentStep}
                    </div>
                    {workflowState.status === 'completed' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                </div>
            </div>
        </div>
    );
}
