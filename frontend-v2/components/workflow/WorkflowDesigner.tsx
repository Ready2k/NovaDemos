'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import WorkflowGraph from './WorkflowGraph';
import WorkflowSidebar from './WorkflowSidebar';
import { Save, Plus, Trash2, Play, RefreshCw } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';

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

    // Test Config State
    const [prompts, setPrompts] = useState<{ id: string, name: string, source?: string }[]>([]);
    const [testConfig, setTestConfig] = useState<{
        personaId: string;
        successCriteria: string;
        testInstructions: string;
        disconnectAction: 'always' | 'never' | 'ask';
        saveReport: boolean;
        saveConfig: boolean;
        maxTurns: number;
    }>({
        personaId: '',
        successCriteria: '',
        testInstructions: '',
        disconnectAction: 'always',
        saveReport: true,
        saveConfig: true,
        maxTurns: 10
    });

    // Custom Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        onConfirm: (input?: string) => void;
        showInput?: boolean;
        placeholder?: string;
        type: 'danger' | 'info';
    } | null>(null);

    const [modalInput, setModalInput] = useState('');

    // Initial Load
    useEffect(() => {
        loadWorkflowsList();
        fetchPrompts();
    }, []);

    const fetchPrompts = async () => {
        try {
            const res = await fetch('/api/prompts');
            if (res.ok) {
                setPrompts(await res.json());
            }
        } catch (e) {
            console.error("Failed to load prompts", e);
        }
    };

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
            setCurrentWorkflowId(id);

            // Load saved test config if available
            if (data.testConfig) {
                setTestConfig({
                    personaId: data.testConfig.personaId || '',
                    successCriteria: data.testConfig.successCriteria || '',
                    testInstructions: data.testConfig.testInstructions || '',
                    disconnectAction: data.testConfig.disconnectAction || 'always',
                    saveReport: data.testConfig.saveReport ?? true,
                    saveConfig: true,
                    maxTurns: data.testConfig.maxTurns || 10
                });
            } else if (data.testPersona) {
                // Legacy fallback: try to match string to a persona ID? 
                // Or just leave blank since it was likely free text before
                setTestConfig(prev => ({ ...prev, personaId: '' }));
            }

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

        // Reset session
        resetSession();

        try {
            // 1. Prepare Config
            const configToSave = {
                personaId: testConfig.personaId,
                successCriteria: testConfig.successCriteria,
                testInstructions: testConfig.testInstructions,
                disconnectAction: testConfig.disconnectAction,
                saveReport: testConfig.saveReport,
                maxTurns: testConfig.maxTurns
            };

            // 2. Save Config to Workflow if requested
            if (testConfig.saveConfig) {
                const updatedWorkflow = {
                    ...workflow,
                    testConfig: configToSave
                };
                setWorkflow(updatedWorkflow); // Update local state

                // Silent save to backend
                await fetch(`/api/workflow/${currentWorkflowId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedWorkflow)
                });
            }

            setShowTestConfig(false);

            // 3. Ensure linked
            const currentLinked = settings.linkedWorkflows || [];
            if (!currentLinked.includes(currentWorkflowId)) {
                updateSettings({ linkedWorkflows: [...currentLinked, currentWorkflowId] });
            }

            // 4. Configure App Settings for Test
            updateSettings({
                testMode: mode,
                activeTestConfig: configToSave,
                simulationMode: mode === 'auto',
                // For auto-mode 'simulationPersona' is usually the system prompt content,
                // but here we pass the ID to be resolved by the backend or context
                simulationPersona: testConfig.personaId
            });

            navigateTo('chat');

        } catch (e) {
            console.error("Test failed", e);
            setError("Failed to start test");
        }
    };

    const handleCreateNew = () => {
        setModalInput('');
        setModalConfig({
            isOpen: true,
            title: 'Create New Workflow',
            message: 'Enter an ID for the new workflow (e.g. my_process). It will be converted to snake_case.',
            confirmText: 'Create',
            showInput: true,
            placeholder: 'my_process',
            type: 'info',
            onConfirm: (name) => {
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
                setModalConfig(null);
            }
        });
    };

    const handleDeleteWorkflow = async () => {
        if (!currentWorkflowId) return;

        setModalConfig({
            isOpen: true,
            title: 'Delete Workflow',
            message: `Are you sure you want to delete "${currentWorkflowId}"? This action cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger',
            onConfirm: async () => {
                try {
                    await fetch(`/api/workflow/${currentWorkflowId}`, { method: 'DELETE' });
                    const remaining = workflows.filter(w => w.id !== currentWorkflowId);
                    setWorkflows(remaining);
                    if (remaining.length > 0) loadWorkflow(remaining[0].id);
                    else {
                        setWorkflow({ id: 'new', nodes: [], edges: [] });
                        setCurrentWorkflowId(null);
                    }
                    setModalConfig(null);
                } catch (e) {
                    console.error(e);
                    setError("Failed to delete workflow");
                    setModalConfig(null);
                }
            }
        });
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
        setModalConfig({
            isOpen: true,
            title: 'Delete Node',
            message: 'Are you sure you want to delete this node and all its connected edges?',
            confirmText: 'Delete',
            type: 'danger',
            onConfirm: () => {
                setWorkflow(prev => ({
                    ...prev,
                    nodes: prev.nodes.filter(n => n.id !== id),
                    edges: prev.edges.filter(e => e.from !== id && e.to !== id)
                }));
                setSelectedNodeId(null);
                setModalConfig(null);
            }
        });
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
                    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                        <div className={cn(
                            "w-full max-w-2xl rounded-2xl shadow-2xl p-0 border flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95",
                            isDarkMode ? "bg-[#0F0F12] border-white/10" : "bg-white border-gray-200"
                        )}>
                            {/* Header */}
                            <div className="p-6 border-b border-white/5 bg-white/5">
                                <h3 className={cn("text-xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                                    Test Configuration
                                </h3>
                                <p className={cn("text-sm mt-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                    Configure parameters for validating this workflow.
                                </p>
                            </div>

                            {/* Body */}
                            <div className="flex-1 min-h-0 p-6 pb-20 space-y-6 overflow-y-auto custom-scrollbar">
                                {/* 1. Persona Selection */}
                                <div className="space-y-2">
                                    <label className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                        Test Persona <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={testConfig.personaId}
                                        onChange={e => setTestConfig(prev => ({ ...prev, personaId: e.target.value }))}
                                        className={cn(
                                            "w-full p-3 rounded-lg border outline-none transition-all",
                                            isDarkMode
                                                ? "bg-black/20 border-white/10 text-white focus:border-violet-500 hover:border-white/20"
                                                : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                                        )}
                                    >
                                        <option value="">Select a persona...</option>
                                        {prompts.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.source === 'langfuse' ? '☁️' : '👤'} {p.name || 'Untitled Persona'}
                                            </option>
                                        ))}
                                    </select>
                                    {testConfig.personaId && (
                                        <p className="text-xs text-violet-500">
                                            Role: {prompts.find(p => p.id === testConfig.personaId)?.name}
                                        </p>
                                    )}
                                </div>

                                {/* 2. Test Instructions */}
                                <div className="space-y-2">
                                    <label className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                        Test Instructions (For LLM)
                                    </label>
                                    <textarea
                                        value={testConfig.testInstructions}
                                        onChange={e => setTestConfig(prev => ({ ...prev, testInstructions: e.target.value }))}
                                        placeholder="e.g. Pretend to be in a noisy environment. Ask specifically about refund policies..."
                                        className={cn(
                                            "w-full h-24 p-3 rounded-lg border outline-none resize-none transition-all",
                                            isDarkMode
                                                ? "bg-black/20 border-white/10 text-white focus:border-violet-500 placeholder-white/20"
                                                : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                                        )}
                                    />
                                </div>


                                {/* 2.5 Max Turns */}
                                <div className="space-y-2">
                                    <label className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                        Max Turns
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={testConfig.maxTurns}
                                        onChange={e => setTestConfig(prev => ({ ...prev, maxTurns: parseInt(e.target.value) || 10 }))}
                                        className={cn(
                                            "w-full p-3 rounded-lg border outline-none transition-all",
                                            isDarkMode
                                                ? "bg-black/20 border-white/10 text-white focus:border-violet-500 placeholder-white/20"
                                                : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                                        )}
                                    />
                                </div>

                                {/* 3. Success Criteria */}
                                <div className="space-y-2">
                                    <label className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                        Success Criteria
                                    </label>
                                    <textarea
                                        value={testConfig.successCriteria}
                                        onChange={e => setTestConfig(prev => ({ ...prev, successCriteria: e.target.value }))}
                                        placeholder="e.g. User successfully completes ID verification and receives a confirmation number..."
                                        className={cn(
                                            "w-full h-24 p-3 rounded-lg border outline-none resize-none transition-all",
                                            isDarkMode
                                                ? "bg-black/20 border-white/10 text-white focus:border-violet-500 placeholder-white/20"
                                                : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                                        )}
                                    />
                                </div>

                                {/* 4. Post-Action & Reports */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className={cn("text-xs font-bold uppercase tracking-wider", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                                            Action After Outcome
                                        </label>
                                        <select
                                            value={testConfig.disconnectAction}
                                            onChange={e => setTestConfig(prev => ({ ...prev, disconnectAction: e.target.value as any }))}
                                            className={cn(
                                                "w-full p-3 rounded-lg border outline-none",
                                                isDarkMode
                                                    ? "bg-black/20 border-white/10 text-white focus:border-violet-500"
                                                    : "bg-gray-50 border-gray-200 text-gray-900"
                                            )}
                                        >
                                            <option value="always">Always Disconnect</option>
                                            <option value="ask">Ask User</option>
                                            <option value="never">Keep Open</option>
                                        </select>
                                    </div>

                                    <div className="space-y-4 pt-1">
                                        <label className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors", isDarkMode ? "border-white/10 hover:bg-white/5" : "border-gray-200 hover:bg-gray-50")}>
                                            <input
                                                type="checkbox"
                                                checked={testConfig.saveReport}
                                                onChange={e => setTestConfig(prev => ({ ...prev, saveReport: e.target.checked }))}
                                                className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <div>
                                                <div className={cn("text-sm font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Generate Test Report</div>
                                                <div className="text-xs text-gray-500">Show detailed summary after test</div>
                                            </div>
                                        </label>

                                        <label className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors", isDarkMode ? "border-white/10 hover:bg-white/5" : "border-gray-200 hover:bg-gray-50")}>
                                            <input
                                                type="checkbox"
                                                checked={testConfig.saveConfig}
                                                onChange={e => setTestConfig(prev => ({ ...prev, saveConfig: e.target.checked }))}
                                                className="w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                            />
                                            <div>
                                                <div className={cn("text-sm font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Save Configuration</div>
                                                <div className="text-xs text-gray-500">Persist these settings for future tests</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className={cn("p-6 border-t flex justify-between items-center bg-black/20", isDarkMode ? "border-white/10" : "border-gray-200")}>
                                <button
                                    onClick={() => setShowTestConfig(false)}
                                    className={cn("px-6 py-2.5 rounded-lg text-sm font-medium transition-colors", isDarkMode ? "hover:bg-white/5 text-gray-400 hover:text-white" : "hover:bg-gray-100 text-gray-600")}
                                >
                                    Cancel
                                </button>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleStartTest('manual')}
                                        disabled={!testConfig.personaId}
                                        className={cn(
                                            "px-6 py-2.5 rounded-lg text-sm font-bold border transition-all",
                                            !testConfig.personaId
                                                ? "opacity-50 cursor-not-allowed border-transparent text-gray-500"
                                                : isDarkMode
                                                    ? "border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                                                    : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                        )}
                                    >
                                        Manual Test
                                    </button>
                                    <button
                                        onClick={() => handleStartTest('auto')}
                                        disabled={!testConfig.personaId}
                                        className={cn(
                                            "px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-lg transition-all",
                                            !testConfig.personaId
                                                ? "bg-gray-700 opacity-50 cursor-not-allowed"
                                                : "bg-violet-600 hover:bg-violet-500 shadow-violet-500/20 hover:scale-[1.02]"
                                        )}
                                    >
                                        Auto-Simulate
                                    </button>
                                </div>
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

                {/* Confirm Modal */}
                <ConfirmModal
                    isOpen={modalConfig?.isOpen || false}
                    title={modalConfig?.title || ''}
                    message={modalConfig?.message || ''}
                    confirmText={modalConfig?.confirmText}
                    onConfirm={modalConfig?.onConfirm || (() => { })}
                    onCancel={() => setModalConfig(null)}
                    showInput={modalConfig?.showInput}
                    inputValue={modalInput}
                    placeholder={modalConfig?.placeholder}
                    type={modalConfig?.type}
                    isDarkMode={isDarkMode}
                />
            </div>
        </div >
    );
}
