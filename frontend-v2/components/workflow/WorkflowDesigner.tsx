'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import WorkflowGraph from './WorkflowGraph';
import WorkflowSidebar from './WorkflowSidebar';
import { Save, Plus, Trash2, Play, RefreshCw } from 'lucide-react';

export default function WorkflowDesigner() {
    const { isDarkMode, navigateTo, updateSettings, settings, resetSession } = useApp();
    const [workflows, setWorkflows] = useState<{ id: string, name: string }[]>([]);
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
    const [workflow, setWorkflow] = useState<WorkflowDefinition>({ id: 'new', nodes: [], edges: [] });
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        loadWorkflowsList();
    }, []);

    const loadWorkflowsList = async () => {
        try {
            const res = await fetch('/api/workflows');
            const data = await res.json();
            setWorkflows(data);
            if (data.length > 0 && !currentWorkflowId) {
                loadWorkflow(data[0].id);
            }
        } catch (e) {
            console.error("Failed to load workflows", e);
            setError("Failed to load list");
        }
    };

    const loadWorkflow = async (id: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/workflow/${id}`);
            if (!res.ok) throw new Error("Not found");
            const data = await res.json();
            // Ensure data follows structure
            setWorkflow({
                id: data.id,
                name: data.name,
                nodes: data.nodes || [],
                edges: data.edges || []
            });
            setCurrentWorkflowId(id);
            setSelectedNodeId(null);
            setSelectedEdgeIndex(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (silent = false) => {
        if (!currentWorkflowId) return;
        setIsSaving(true);
        if (!silent) setSuccessMsg(null);
        try {
            const res = await fetch(`/api/workflow/${currentWorkflowId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflow)
            });
            if (!res.ok) throw new Error("Failed to save");
            if (!silent) {
                setSuccessMsg("Workflow saved successfully");
                setTimeout(() => setSuccessMsg(null), 3000);
            }
        } catch (e: any) {
            setError(e.message);
            throw e; // Re-throw for handleTest to catch
        } finally {
            setIsSaving(false);
        }
    };

    const [showTestConfig, setShowTestConfig] = useState(false);

    const handleTestClick = () => {
        if (!currentWorkflowId) return;
        setShowTestConfig(true);
    };

    const handleStartTest = async (mode: 'manual' | 'auto') => {
        if (!currentWorkflowId) return;

        // Reset session to ensure clean slate for simulation
        resetSession();

        try {
            // 1. Save w/ Persona
            setShowTestConfig(false);
            await handleSave(true);

            // 2. Ensure linked
            const currentLinked = settings.linkedWorkflows || [];
            if (!currentLinked.includes(currentWorkflowId)) {
                updateSettings({ linkedWorkflows: [...currentLinked, currentWorkflowId] });
            }

            // 3. Navigate
            // Pass simulation flag via URL or handle in AppContext?
            // Since we use `navigateTo('chat')` which switches view in `page.tsx`,
            // we might need to pass params to `navigateTo` or set a temporary flag in Settings/Context.
            // Using URL Query param is easiest if `page.tsx` reads it, but `navigateTo` might just set state.
            // Let's update `navigateTo` to support params OR use `window.location.hash` hack?
            // Better: updateSettings with `simulationMode: true` triggers?
            // Or `forceSimulation` in SessionConfig?
            // Let's assume we can pass it via `updateSettings({ testMode: mode, testPersona: workflow.testPersona })`.

            if (mode === 'auto') {
                updateSettings({
                    simulationMode: true,
                    simulationPersona: workflow.testPersona
                });
            } else {
                updateSettings({
                    simulationMode: false,
                    simulationPersona: undefined
                });
            }

            navigateTo('chat');

        } catch (e) {
            console.error("Test failed", e);
        }
    };

    const handleCreateNew = () => {
        const name = prompt("Enter ID for new workflow (e.g. my_process):");
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        const newWorkflow: WorkflowDefinition = {
            id,
            name: name,
            nodes: [
                { id: 'start', type: 'start', label: 'Start Process' },
                { id: 'end', type: 'end', label: 'End Process' }
            ],
            edges: [
                { from: 'start', to: 'end' }
            ]
        };

        setWorkflow(newWorkflow);
        setCurrentWorkflowId(id);
        setWorkflows(prev => [...prev, { id, name }]);
        setSelectedNodeId(null);
    };

    const handleDeleteWorkflow = async () => {
        if (!currentWorkflowId || !confirm(`Delete workflow ${currentWorkflowId}?`)) return;

        try {
            await fetch(`/api/workflow/${currentWorkflowId}`, { method: 'DELETE' });
            const remaining = workflows.filter(w => w.id !== currentWorkflowId);
            setWorkflows(remaining);
            if (remaining.length > 0) loadWorkflow(remaining[0].id);
            else {
                setWorkflow({ id: 'new', nodes: [], edges: [] });
                setCurrentWorkflowId(null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // --- Graph Mutation Handlers ---

    const updateNode = (node: WorkflowNode) => {
        setWorkflow(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === node.id ? node : n)
        }));
    };

    const updateEdge = (index: number, edge: WorkflowEdge) => {
        setWorkflow(prev => ({
            ...prev,
            edges: prev.edges.map((e, i) => i === index ? edge : e)
        }));
    };

    const addNode = () => {
        const newId = `node_${Math.floor(Math.random() * 1000)}`;
        setWorkflow(prev => ({
            ...prev,
            nodes: [...prev.nodes, { id: newId, type: 'process', label: 'New Node' }]
        }));
        setSelectedNodeId(newId);
    };

    const deleteNode = (id: string) => {
        if (!confirm("Delete node and connected edges?")) return;
        setWorkflow(prev => ({
            ...prev,
            nodes: prev.nodes.filter(n => n.id !== id),
            edges: prev.edges.filter(e => e.from !== id && e.to !== id)
        }));
        setSelectedNodeId(null);
    };

    const addEdge = () => {
        if (workflow.nodes.length < 2) return;
        setWorkflow(prev => ({
            ...prev,
            edges: [...prev.edges, { from: prev.nodes[0].id, to: prev.nodes[1].id }]
        }));
        setSelectedEdgeIndex(workflow.edges.length); // Correct index logic needed if state updates async? 
        // Actually length won't update immediately in this closure.
        // Effectively sets it to the new index.
    };

    const deleteEdge = (index: number) => {
        setWorkflow(prev => ({
            ...prev,
            edges: prev.edges.filter((_, i) => i !== index)
        }));
        setSelectedEdgeIndex(null);
    };

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Sidebar */}
            <WorkflowSidebar
                workflow={workflow}
                selectedNodeId={selectedNodeId}
                selectedEdgeIndex={selectedEdgeIndex}
                onNodeSelect={setSelectedNodeId}
                onEdgeSelect={setSelectedEdgeIndex}
                onUpdateNode={updateNode}
                onUpdateEdge={updateEdge}
                onAddNode={addNode}
                onDeleteNode={deleteNode}
                onAddEdge={addEdge}
                onDeleteEdge={deleteEdge}
                isDarkMode={isDarkMode}
            />

            {/* Main Area */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Toolbar overlay */}
                <div className={cn(
                    "absolute top-4 left-4 z-10 p-2 rounded-lg border backdrop-blur-md flex items-center gap-2",
                    isDarkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-gray-200"
                )}>
                    <select
                        value={currentWorkflowId || ''}
                        onChange={e => loadWorkflow(e.target.value)}
                        className={cn(
                            "bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer min-w-[150px]",
                            isDarkMode ? "text-white" : "text-black"
                        )}
                    >
                        {workflows.map(w => (
                            <option key={w.id} value={w.id} className="text-black">{w.name}</option>
                        ))}
                    </select>

                    <div className="w-px h-4 bg-gray-500/20 mx-1" />

                    <button onClick={handleCreateNew} className={cn("p-1.5 rounded hover:bg-white/10", isDarkMode ? "text-gray-300" : "text-gray-600")} title="New Workflow">
                        <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={handleDeleteWorkflow} className={cn("p-1.5 rounded hover:bg-red-500/20 text-red-500")} title="Delete Workflow">
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-gray-500/20 mx-1" />

                    <button
                        onClick={handleTestClick}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
                            isDarkMode ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-emerald-600 text-white"
                        )}
                        title="Test Workflow"
                    >
                        <Play className="w-3 h-3" />
                        TEST
                    </button>

                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
                            isSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                            isDarkMode ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-indigo-600 text-white"
                        )}
                    >
                        {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        SAVE
                    </button>
                </div>

                {/* Toast Messages */}
                {successMsg && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg shadow-lg animate-in fade-in slide-in-from-top-4">
                        {successMsg}
                    </div>
                )}
                {error && (
                    <div className="absolute bottom-4 left-4 z-20 px-4 py-2 bg-red-500/90 text-white text-sm font-medium rounded-lg shadow-lg">
                        Error: {error}
                    </div>
                )}

                {/* Test Config Modal */}
                {showTestConfig && (
                    <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className={cn(
                            "w-full max-w-lg rounded-xl shadow-2xl p-6 border animate-in zoom-in-95",
                            isDarkMode ? "bg-gray-900 border-white/10" : "bg-white border-gray-200"
                        )}>
                            <h3 className={cn("text-lg font-bold mb-4", isDarkMode ? "text-white" : "text-gray-900")}>Test Workflow Configuration</h3>

                            <div className="mb-4">
                                <label className={cn("block text-xs font-medium mb-1", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                    Test Persona (Who is the user?)
                                </label>
                                <textarea
                                    value={workflow.testPersona || ''}
                                    onChange={e => setWorkflow(prev => ({ ...prev, testPersona: e.target.value }))}
                                    className={cn(
                                        "w-full h-32 px-3 py-2 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500",
                                        isDarkMode ? "bg-black/50 border-white/10 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-black"
                                    )}
                                    placeholder="E.g. I am a first-time home buyer with a budget of £300,000 looking for a property in London..."
                                />
                            </div>

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowTestConfig(false)}
                                    className={cn("px-4 py-2 rounded-md text-sm font-medium", isDarkMode ? "hover:bg-white/5 text-gray-300" : "hover:bg-gray-100 text-gray-600")}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleStartTest('manual')}
                                    className={cn("px-4 py-2 rounded-md text-sm font-medium border", isDarkMode ? "border-white/10 hover:bg-white/5 text-white" : "border-gray-300 hover:bg-gray-50 text-black")}
                                >
                                    Manual Test
                                </button>
                                <button
                                    onClick={() => handleStartTest('auto')}
                                    className="px-4 py-2 rounded-md text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20"
                                >
                                    Auto-Simulate
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Graph */}
                <WorkflowGraph
                    workflow={workflow}
                    selectedNodeId={selectedNodeId}
                    onNodeSelect={setSelectedNodeId}
                    onEdgeSelect={setSelectedEdgeIndex}
                    isDarkMode={isDarkMode}
                />
            </div>
        </div>
    );
}
