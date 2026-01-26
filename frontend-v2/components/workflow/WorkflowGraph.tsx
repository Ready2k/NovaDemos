'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { WorkflowDefinition, WorkflowNode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Maximize, Minimize, Move } from 'lucide-react';

interface WorkflowGraphProps {
    workflow: WorkflowDefinition;
    selectedNodeId: string | null;
    onNodeSelect: (id: string) => void;
    onEdgeSelect?: (index: number) => void;
    className?: string;
    isDarkMode?: boolean;
}

export default function WorkflowGraph({
    workflow,
    selectedNodeId,
    onNodeSelect,
    onEdgeSelect,
    className,
    isDarkMode = true
}: WorkflowGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string>('');
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Initialize Mermaid
    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: isDarkMode ? 'dark' : 'default',
            securityLevel: 'loose',
            flowchart: {
                curve: 'basis',
                htmlLabels: true
            }
        });
    }, [isDarkMode]);

    // Generate Mermaid Definition
    const generateMermaidDef = useCallback(() => {
        let def = 'flowchart TD\n';

        // Safety for IDs
        const safeId = (id: string) => {
            const reserved = ['end', 'subgraph', 'class', 'click', 'style'];
            if (reserved.includes(id)) return id + '_safe';
            if (!id.match(/^[a-zA-Z0-9_]+$/)) return id.replace(/[^a-zA-Z0-9_]/g, '_');
            return id;
        };

        const getNodeStyle = (node: WorkflowNode) => {
            if (node.id === selectedNodeId) return 'fill:#6366f1,stroke:#818cf8,stroke-width:3px,color:#fff';

            if (isDarkMode) {
                switch (node.type) {
                    case 'start':
                    case 'end': return 'fill:#1f2937,stroke:#3b82f6,color:#fff';
                    case 'decision': return 'fill:#374151,stroke:#f59e0b,color:#fff';
                    case 'tool': return 'fill:#111827,stroke:#8b5cf6,color:#fff';
                    case 'workflow': return 'fill:#111827,stroke:#f43f5e,stroke-width:2px,color:#fff,stroke-dasharray: 5 5';
                    default: return 'fill:#1f2937,stroke:#4b5563,color:#9ca3af';
                }
            } else {
                switch (node.type) {
                    case 'start':
                    case 'end': return 'fill:#f8fafc,stroke:#3b82f6,color:#1e293b';
                    case 'decision': return 'fill:#fffbeb,stroke:#f59e0b,color:#451a03';
                    case 'tool': return 'fill:#f5f3ff,stroke:#8b5cf6,color:#2e1065';
                    case 'workflow': return 'fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#4c0519,stroke-dasharray: 5 5';
                    default: return 'fill:#f1f5f9,stroke:#94a3b8,color:#475569';
                }
            }
        };

        workflow.nodes.forEach(n => {
            const sid = safeId(n.id);
            const label = (n.label || n.id).replace(/"/g, "'").replace(/\n/g, '<br/>');
            let shapeStart = '[', shapeEnd = ']';

            if (n.type === 'start' || n.type === 'end') { shapeStart = '(['; shapeEnd = '])'; }
            else if (n.type === 'decision') { shapeStart = '{'; shapeEnd = '}'; }
            else if (n.type === 'tool') { shapeStart = '[['; shapeEnd = ']]'; }
            else if (n.type === 'workflow') { shapeStart = '{{'; shapeEnd = '}}'; }

            def += `    ${sid}${shapeStart}"${label}"${shapeEnd}\n`;
            def += `    style ${sid} ${getNodeStyle(n)}\n`;

            // Add interaction class
            def += `    click ${sid} call onNodeClick("${n.id}")\n`;
        });

        workflow.edges.forEach((edge, idx) => {
            const label = edge.label ? `|"${edge.label.replace(/"/g, "'")}"|` : '';
            def += `    ${safeId(edge.from)} -->${label} ${safeId(edge.to)}\n`;
        });

        return def;
    }, [workflow, selectedNodeId]);

    // Render Graph
    useEffect(() => {
        const render = async () => {
            try {
                const def = generateMermaidDef();
                const { svg } = await mermaid.render(`mermaid-${Math.random().toString(36).substr(2, 9)}`, def);
                setSvgContent(svg);
            } catch (e) {
                console.error("Mermaid render error:", e);
                // Keep old SVG on error or show placeholder?
            }
        };
        render();
    }, [generateMermaidDef]);


    // Bind Click Events (Mermaid 'click' callback needs global scope usually, but we can try delegating)
    useEffect(() => {
        // @ts-ignore
        window.onNodeClick = (id: string) => {
            onNodeSelect(id);
        };
        return () => {
            // @ts-ignore
            delete window.onNodeClick;
        }
    }, [onNodeSelect]);


    // Pan/Zoom Handlers
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY * -0.001;
            setScale(s => Math.min(Math.max(0.2, s + delta), 5));
        } else {
            setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) { // Left click
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);


    return (
        <div
            ref={containerRef}
            className={cn(
                "w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing",
                isDarkMode ? "bg-black/20" : "bg-white/40",
                className
            )}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Controls */}
            <div className={cn(
                "absolute top-4 right-4 z-10 flex flex-col gap-2 p-2 rounded-lg border backdrop-blur-sm",
                isDarkMode ? "bg-black/50 border-white/10" : "bg-white/80 border-gray-200 shadow-sm"
            )}>
                <button onClick={() => setScale(s => Math.min(s + 0.2, 5))} className={cn("p-1 rounded", isDarkMode ? "hover:bg-white/10 text-white" : "hover:bg-gray-100 text-gray-700")}>
                    <Maximize className="w-4 h-4" />
                </button>
                <div className={cn("text-xs text-center font-mono", isDarkMode ? "text-gray-400" : "text-gray-500")}>{Math.round(scale * 100)}%</div>
                <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className={cn("p-1 rounded", isDarkMode ? "hover:bg-white/10 text-white" : "hover:bg-gray-100 text-gray-700")}>
                    <Minimize className="w-4 h-4" />
                </button>
                <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className={cn("p-1 rounded", isDarkMode ? "hover:bg-white/10 text-white" : "hover:bg-gray-100 text-gray-700")} title="Fit">
                    <Move className="w-4 h-4" />
                </button>
            </div>

            <div
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                className="w-full h-full flex items-center justify-center p-20"
                dangerouslySetInnerHTML={{ __html: svgContent }}
            />
        </div>
    );
}
