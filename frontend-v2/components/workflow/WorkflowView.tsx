'use client';

import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import WorkflowVisualizer from '@/components/chat/WorkflowVisualizer'; // Keep for legacy read-only needs elsewhere?
import WorkflowDesigner from './WorkflowDesigner';
import { Network, Edit3, Save, Play } from 'lucide-react';

export default function WorkflowView() {
    const { isDarkMode, workflowState } = useApp();

    return (
        <div className="flex flex-col h-full w-full bg-black/90 text-white">
            {/* Header */}
            <div className={cn(
                "flex items-center justify-between px-6 py-4 border-b shrink-0",
                isDarkMode ? "border-white/10 bg-black/40" : "border-gray-200 bg-white"
            )}>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-500/10">
                        <Network className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h2 className={cn("text-lg font-bold", isDarkMode ? "text-white" : "text-gray-900")}>Workflow Designer</h2>
                        <p className={cn("text-xs", isDarkMode ? "text-gray-400" : "text-gray-500")}>Create and manage interaction flows</p>
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 w-full h-full overflow-hidden bg-black/90 relative">
                <WorkflowDesigner />
            </div>
        </div>
    );
}
