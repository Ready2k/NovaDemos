'use client';

import React, { useState, useEffect } from 'react';
import { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Trash2, Plus, GripVertical, ChevronRight, ChevronDown } from 'lucide-react';

interface WorkflowSidebarProps {
    workflow: WorkflowDefinition;
    selectedNodeId: string | null;
    selectedEdgeIndex: number | null;
    onNodeSelect: (id: string | null) => void;
    onEdgeSelect: (index: number | null) => void;
    onUpdateNode: (node: WorkflowNode) => void;
    onUpdateEdge: (index: number, edge: WorkflowEdge) => void;
    onAddNode: () => void;
    onDeleteNode: (id: string) => void;
    onAddEdge: () => void;
    onDeleteEdge: (index: number) => void;
    isDarkMode?: boolean;
}

export default function WorkflowSidebar({
    workflow,
    selectedNodeId,
    selectedEdgeIndex,
    onNodeSelect,
    onEdgeSelect,
    onUpdateNode,
    onUpdateEdge,
    onAddNode,
    onDeleteNode,
    onAddEdge,
    onDeleteEdge,
    isDarkMode = true
}: WorkflowSidebarProps) {
    const [activeTab, setActiveTab] = useState<'nodes' | 'edges'>('nodes');
    const selectedNode = selectedNodeId ? workflow.nodes.find(n => n.id === selectedNodeId) : null;
    const selectedEdge = selectedEdgeIndex !== null ? workflow.edges[selectedEdgeIndex] : null;

    // Switch tabs if selection changes
    useEffect(() => {
        if (selectedNodeId) setActiveTab('nodes');
    }, [selectedNodeId]);

    useEffect(() => {
        if (selectedEdgeIndex !== null) setActiveTab('edges');
    }, [selectedEdgeIndex]);

    return (
        <div className={cn(
            "w-80 border-r flex flex-col h-full shrink-0 transition-colors",
            isDarkMode ? "bg-black/40 border-white/10" : "bg-gray-50 border-gray-200"
        )}>
            {/* Tabs */}
            <div className="flex border-b border-inherit">
                <button
                    onClick={() => { setActiveTab('nodes'); onNodeSelect(null); onEdgeSelect(null); }}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'nodes'
                            ? "border-violet-500 text-violet-500"
                            : "border-transparent text-gray-500 hover:text-gray-400"
                    )}
                >
                    Nodes
                </button>
                <button
                    onClick={() => { setActiveTab('edges'); onNodeSelect(null); onEdgeSelect(null); }}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'edges'
                            ? "border-violet-500 text-violet-500"
                            : "border-transparent text-gray-500 hover:text-gray-400"
                    )}
                >
                    Connections
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'nodes' ? (
                    <>
                        <div className="p-4 border-b border-inherit bg-inherit z-10">
                            <button
                                onClick={onAddNode}
                                className={cn(
                                    "w-full py-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-all",
                                    isDarkMode
                                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-gray-200"
                                        : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                                )}
                            >
                                <Plus className="w-4 h-4" /> Add Node
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {workflow.nodes.map(node => (
                                <div
                                    key={node.id}
                                    onClick={() => onNodeSelect(node.id)}
                                    className={cn(
                                        "p-3 rounded-lg border text-left cursor-pointer transition-all group relative",
                                        selectedNodeId === node.id
                                            ? "border-violet-500 bg-violet-500/10"
                                            : isDarkMode
                                                ? "border-transparent hover:bg-white/5"
                                                : "border-transparent hover:bg-gray-100"
                                    )}
                                >
                                    <div className={cn("font-bold text-sm", isDarkMode ? "text-gray-200" : "text-gray-800")}>
                                        {node.id}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate mt-0.5">
                                        {node.label}
                                    </div>
                                    <div className={cn(
                                        "text-[10px] uppercase font-mono mt-2 inline-block px-1.5 py-0.5 rounded",
                                        isDarkMode ? "bg-white/10 text-gray-400" : "bg-gray-200 text-gray-600"
                                    )}>
                                        {node.type}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Node Editor */}
                        {selectedNode && (
                            <div className={cn(
                                "border-t p-4 h-1/2 overflow-y-auto shrink-0 space-y-4 shadow-xl z-20",
                                isDarkMode ? "bg-[#1e1e24] border-white/10" : "bg-white border-gray-200"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold uppercase text-violet-500">Edit Node</span>
                                    <button
                                        onClick={() => onDeleteNode(selectedNode.id)}
                                        className={cn(
                                            "p-1 rounded transition-colors",
                                            isDarkMode ? "text-red-400 hover:text-red-300 hover:bg-red-900/20" : "text-red-600 hover:text-red-700 hover:bg-red-100"
                                        )}
                                        title="Delete Node"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">ID</label>
                                        <input
                                            value={selectedNode.id}
                                            disabled // ID editing is complex due to refs, keep simple for now
                                            className={cn("w-full text-xs p-2 rounded border bg-transparent opacity-50 cursor-not-allowed", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200")}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cn("text-xs", isDarkMode ? "text-gray-500" : "text-gray-600")}>Label</label>
                                        <textarea
                                            value={selectedNode.label}
                                            onChange={e => onUpdateNode({ ...selectedNode, label: e.target.value })}
                                            rows={2}
                                            className={cn("w-full text-xs p-2 rounded border bg-transparent", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200 text-gray-900")}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={cn("text-xs", isDarkMode ? "text-gray-500" : "text-gray-600")}>Type</label>
                                        <select
                                            value={selectedNode.type}
                                            onChange={e => onUpdateNode({ ...selectedNode, type: e.target.value as any })}
                                            className={cn("w-full text-xs p-2 rounded border bg-transparent", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200 text-gray-900")}
                                        >
                                            <option value="process" className={isDarkMode ? "" : "text-black"}>Process</option>
                                            <option value="decision" className={isDarkMode ? "" : "text-black"}>Decision</option>
                                            <option value="tool" className={isDarkMode ? "" : "text-black"}>Tool</option>
                                            <option value="workflow" className={isDarkMode ? "" : "text-black"}>Workflow</option>
                                            <option value="start" className={isDarkMode ? "" : "text-black"}>Start</option>
                                            <option value="end" className={isDarkMode ? "" : "text-black"}>End</option>
                                        </select>
                                    </div>

                                    {/* Type Specific Fields */}
                                    {selectedNode.type === 'tool' && (
                                        <div className={cn(
                                            "p-3 rounded-lg space-y-2 border",
                                            isDarkMode ? "bg-violet-500/10 border-violet-500/20" : "bg-violet-50 border-violet-200"
                                        )}>
                                            <label className={cn("text-xs font-medium", isDarkMode ? "text-violet-300" : "text-violet-700")}>Tool Name</label>
                                            <input
                                                value={selectedNode.toolName || ''}
                                                onChange={e => onUpdateNode({ ...selectedNode, toolName: e.target.value })}
                                                placeholder="e.g. get_balance"
                                                className={cn(
                                                    "w-full text-xs p-2 rounded border font-mono",
                                                    isDarkMode ? "border-white/10 bg-black/20 text-white" : "border-violet-200 bg-white text-violet-900"
                                                )}
                                            />
                                        </div>
                                    )}

                                    {selectedNode.type === 'workflow' && (
                                        <div className={cn(
                                            "p-3 rounded-lg space-y-2 border",
                                            isDarkMode ? "bg-pink-500/10 border-pink-500/20" : "bg-pink-50 border-pink-200"
                                        )}>
                                            <label className={cn("text-xs font-medium", isDarkMode ? "text-pink-300" : "text-pink-700")}>Target Workflow ID</label>
                                            <input
                                                value={selectedNode.workflowId || ''}
                                                onChange={e => onUpdateNode({ ...selectedNode, workflowId: e.target.value })}
                                                placeholder="e.g. banking_dispute"
                                                className={cn(
                                                    "w-full text-xs p-2 rounded border font-mono",
                                                    isDarkMode ? "border-white/10 bg-black/20 text-white" : "border-pink-200 bg-white text-pink-900"
                                                )}
                                            />
                                        </div>
                                    )}
                                    {selectedNode.type === 'end' && (
                                        <div className={cn(
                                            "p-3 rounded-lg space-y-2 border",
                                            isDarkMode ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
                                        )}>
                                            <label className={cn("text-xs font-medium", isDarkMode ? "text-emerald-300" : "text-emerald-700")}>Outcome</label>
                                            <input
                                                value={selectedNode.outcome || ''}
                                                onChange={e => onUpdateNode({ ...selectedNode, outcome: e.target.value })}
                                                placeholder="e.g. RESOLVED"
                                                className={cn(
                                                    "w-full text-xs p-2 rounded border font-mono",
                                                    isDarkMode ? "border-white/10 bg-black/20 text-white" : "border-emerald-200 bg-white text-emerald-900"
                                                )}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    /* EDGES TAB */
                    <>
                        <div className="p-4 border-b border-inherit bg-inherit z-10">
                            <button
                                onClick={onAddEdge}
                                className={cn(
                                    "w-full py-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-all",
                                    isDarkMode
                                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-gray-200"
                                        : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                                )}
                            >
                                <Plus className="w-4 h-4" /> Add Connection
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {workflow.edges.map((edge, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => onEdgeSelect(idx)}
                                    className={cn(
                                        "p-3 rounded-lg border text-left cursor-pointer transition-all flex items-center gap-3",
                                        selectedEdgeIndex === idx
                                            ? "border-violet-500 bg-violet-500/10"
                                            : isDarkMode
                                                ? "border-transparent hover:bg-white/5"
                                                : "border-transparent hover:bg-gray-100"
                                    )}
                                >
                                    <div className={cn("text-xs font-mono flex-1", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                                        {edge.from} <span className="text-gray-500">→</span> {edge.to}
                                    </div>
                                    {edge.label && (
                                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 max-w-[80px] truncate">
                                            {edge.label}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Edge Editor */}
                        {selectedEdge && (
                            <div className={cn(
                                "border-t p-4 h-1/2 overflow-y-auto shrink-0 space-y-4 shadow-xl z-20",
                                isDarkMode ? "bg-[#1e1e24] border-white/10" : "bg-white border-gray-200"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold uppercase text-violet-500">Edit Connection</span>
                                    <button
                                        onClick={() => onDeleteEdge(selectedEdgeIndex!)}
                                        className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20"
                                        title="Delete Edge"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">From</label>
                                        <select
                                            value={selectedEdge.from}
                                            onChange={e => onUpdateEdge(selectedEdgeIndex!, { ...selectedEdge, from: e.target.value })}
                                            className={cn("w-full text-xs p-2 rounded border bg-transparent", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200")}
                                        >
                                            {workflow.nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">To</label>
                                        <select
                                            value={selectedEdge.to}
                                            onChange={e => onUpdateEdge(selectedEdgeIndex!, { ...selectedEdge, to: e.target.value })}
                                            className={cn("w-full text-xs p-2 rounded border bg-transparent", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200")}
                                        >
                                            {workflow.nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Label / Condition</label>
                                    <input
                                        value={selectedEdge.label || ''}
                                        onChange={e => onUpdateEdge(selectedEdgeIndex!, { ...selectedEdge, label: e.target.value })}
                                        placeholder="e.g. Yes"
                                        className={cn("w-full text-xs p-2 rounded border bg-transparent", isDarkMode ? "border-white/10 text-gray-300" : "border-gray-200")}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
