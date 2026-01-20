'use client';

import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { Network } from 'lucide-react';

export default function WorkflowSettings() {
    const { settings, updateSettings, isDarkMode } = useApp();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-6">
                <Network className={cn("w-5 h-5", isDarkMode ? "text-indigo-400" : "text-indigo-600")} />
                <h2 className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                    Workflow Configuration
                </h2>
            </div>

            <div className={cn(
                "p-4 rounded-xl border",
                isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            )}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className={cn("text-sm font-medium", isDarkMode ? "text-white" : "text-gray-900")}>
                            Live Visualization
                        </h3>
                        <p className={cn("text-sm mt-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                            Show real-time workflow state and transitions in the chat view
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.showWorkflowVisualization ?? true}
                            onChange={(e) => updateSettings({ showWorkflowVisualization: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </label>
                </div>
            </div>

            <div className="mt-8 p-4 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                <p className="text-sm text-indigo-800 dark:text-indigo-300">
                    <strong>Note:</strong> Linking workflows to specific Personas can be done in the
                    <span className="font-medium mx-1">Persona Settings</span> tab.
                </p>
            </div>
        </div>
    );
}
