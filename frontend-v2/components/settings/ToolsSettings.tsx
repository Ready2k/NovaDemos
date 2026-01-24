'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { Wrench, Plus, Trash2, Save, X } from 'lucide-react';

interface ToolDefinition {
    name: string;
    description: string;
    instruction?: string;
    agentPrompt?: string;
    input_schema?: any;
    inputSchema?: any;
    // We simplify input schema editing for now - users can paste JSON
    parameters?: string | object;
}

export default function ToolsSettings() {
    const { isDarkMode } = useApp();
    const [tools, setTools] = useState<ToolDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);

    useEffect(() => {
        fetchTools();
    }, []);

    const fetchTools = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/tools');
            if (res.ok) {
                const data = await res.json();
                setTools(data);
            }
        } catch (err) {
            console.error('Failed to fetch tools', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!editingTool) return;

        // Validate JSON
        try {
            if (editingTool.parameters) {
                JSON.parse(editingTool.parameters as string);
            }
            setJsonError(null);
        } catch (e: any) {
            setJsonError('Invalid JSON in parameters: ' + e.message);
            return;
        }

        try {
            // Convert string parameters back to object if needed by backend, 
            // but for now we assume backend handles the JSON body we send
            // Actually, backend expects object structure.
            const payload = {
                ...editingTool,
                parameters: editingTool.parameters ? JSON.parse(editingTool.parameters as string) : {}
            };

            const res = await fetch('/api/tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchTools();
                setEditingTool(null);
                setIsNew(false);
            } else {
                alert('Failed to save tool');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving tool');
        }
    };

    const handleDelete = async (name: string) => {
        if (!confirm(`Are you sure you want to delete tool "${name}"?`)) return;

        try {
            const res = await fetch(`/api/tools/${name}`, { method: 'DELETE' });
            if (res.ok) {
                fetchTools();
                if (editingTool?.name === name) {
                    setEditingTool(null);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Wrench className={cn("w-5 h-5", isDarkMode ? "text-indigo-400" : "text-indigo-600")} />
                    <h2 className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                        Tool Management
                    </h2>
                </div>
                {!editingTool && (
                    <button
                        onClick={() => {
                            setEditingTool({ name: '', description: '', parameters: '{}' });
                            setIsNew(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 flex items-center gap-1"
                    >
                        <Plus className="w-4 h-4" /> New Tool
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tool List */}
                <div className={cn(
                    "lg:col-span-1 rounded-xl border overflow-hidden flex flex-col max-h-[600px]",
                    isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                )}>
                    <div className={cn("p-3 border-b text-xs font-semibold uppercase tracking-wider", isDarkMode ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-600")}>
                        Available Tools
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {isLoading ? (
                            <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
                        ) : tools.map(tool => (
                            <button
                                key={tool.name}
                                onClick={() => {
                                    setEditingTool({
                                        ...tool,
                                        parameters: JSON.stringify(tool.input_schema || tool.inputSchema || tool.parameters || {}, null, 2)
                                    });
                                    setIsNew(false);
                                }}
                                className={cn(
                                    "w-full text-left p-3 rounded-lg text-sm transition-colors border",
                                    editingTool?.name === tool.name
                                        ? isDarkMode ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-indigo-50 border-indigo-200 text-indigo-700"
                                        : isDarkMode ? "border-transparent hover:bg-white/5 text-gray-300" : "border-transparent hover:bg-gray-50 text-gray-900"
                                )}
                            >
                                <div className="font-medium">{tool.name}</div>
                                <div className="text-xs opacity-70 truncate">{tool.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Editor */}
                <div className="lg:col-span-2">
                    {editingTool ? (
                        <div className={cn(
                            "rounded-xl border p-6 space-y-4",
                            isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                        )}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>
                                    {isNew ? 'Create New Tool' : `Editing: ${editingTool.name}`}
                                </h3>
                                <div className="flex items-center gap-2">
                                    {!isNew && (
                                        <button
                                            onClick={() => handleDelete(editingTool.name)}
                                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Delete Tool"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setEditingTool(null)}
                                        className={cn("p-2 rounded-lg transition-colors", isDarkMode ? "hover:bg-white/10" : "hover:bg-gray-100")}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={cn("block text-xs font-medium mb-1", isDarkMode ? "opacity-70" : "text-gray-700")}>Tool Name (Unique)</label>
                                    <input
                                        type="text"
                                        value={editingTool.name}
                                        onChange={e => setEditingTool({ ...editingTool, name: e.target.value })}
                                        disabled={!isNew}
                                        className={cn(
                                            "w-full px-3 py-2 rounded-lg text-sm border bg-transparent",
                                            isDarkMode ? "border-white/20 focus:border-indigo-500 text-white" : "border-gray-300 focus:border-indigo-500 text-gray-900",
                                            !isNew && "opacity-50 cursor-not-allowed"
                                        )}
                                    />
                                </div>

                                <div>
                                    <label className={cn("block text-xs font-medium mb-1", isDarkMode ? "opacity-70" : "text-gray-700")}>Description</label>
                                    <textarea
                                        value={editingTool.description}
                                        onChange={e => setEditingTool({ ...editingTool, description: e.target.value })}
                                        rows={2}
                                        className={cn(
                                            "w-full px-3 py-2 rounded-lg text-sm border bg-transparent",
                                            isDarkMode ? "border-white/20 focus:border-indigo-500 text-white" : "border-gray-300 focus:border-indigo-500 text-gray-900"
                                        )}
                                    />
                                </div>

                                <div>
                                    <label className={cn("block text-xs font-medium mb-1", isDarkMode ? "opacity-70" : "text-gray-700")}>Instruction (Optional)</label>
                                    <textarea
                                        value={editingTool.instruction || ''}
                                        onChange={e => setEditingTool({ ...editingTool, instruction: e.target.value })}
                                        rows={2}
                                        className={cn(
                                            "w-full px-3 py-2 rounded-lg text-sm border bg-transparent",
                                            isDarkMode ? "border-white/20 focus:border-indigo-500 text-white" : "border-gray-300 focus:border-indigo-500 text-gray-900"
                                        )}
                                        placeholder="Specific instructions for how the model should use this tool..."
                                    />
                                </div>

                                <div>
                                    <label className={cn("block text-xs font-medium mb-1", isDarkMode ? "opacity-70" : "text-gray-700")}>Parameters (JSON Schema)</label>
                                    <textarea
                                        value={editingTool.parameters as string}
                                        onChange={e => setEditingTool({ ...editingTool, parameters: e.target.value })}
                                        rows={10}
                                        className={cn(
                                            "w-full px-3 py-2 rounded-lg text-sm border bg-transparent font-mono",
                                            isDarkMode ? "border-white/20 focus:border-indigo-500 text-white" : "border-gray-300 focus:border-indigo-500 text-gray-900",
                                            jsonError ? "border-red-500 focus:border-red-500" : ""
                                        )}
                                    />
                                    {jsonError && <p className="text-red-500 text-xs mt-1">{jsonError}</p>}
                                </div>

                                <div className="pt-2 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" /> Save Tool
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={cn(
                            "h-full rounded-xl border flex flex-col items-center justify-center text-center p-8",
                            isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                        )}>
                            <div className={cn("mb-4 p-4 rounded-full", isDarkMode ? "bg-white/5" : "bg-gray-100")}>
                                <Wrench className={cn("w-8 h-8", isDarkMode ? "text-gray-500" : "text-gray-400")} />
                            </div>
                            <h3 className={cn("font-medium mb-1", isDarkMode ? "text-white" : "text-gray-900")}>Select a Tool</h3>
                            <p className="text-sm text-gray-500 max-w-xs">Select a tool from the list to edit its configuration, or create a new one.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
