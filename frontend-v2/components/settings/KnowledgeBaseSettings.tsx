import { useState, useEffect } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { KnowledgeBase } from '@/lib/types';

export default function KnowledgeBaseSettings() {
    const {
        knowledgeBases,
        setKnowledgeBases,
        addKnowledgeBase,
        removeKnowledgeBase,
        isDarkMode
    } = useApp();

    // Local state for new KB form
    const [newKbName, setNewKbName] = useState('');
    const [newKbId, setNewKbId] = useState('');
    const [newKbModel, setNewKbModel] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Fetch KBs on mount
    useEffect(() => {
        const fetchKBs = async () => {
            try {
                const response = await fetch('/api/knowledge-bases');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        setKnowledgeBases(data);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch knowledge bases', err);
            }
        };
        fetchKBs();
    }, [setKnowledgeBases]);

    const handleAddKb = async () => {
        if (!newKbName || !newKbId) return;

        setIsAdding(true);
        try {
            const kb: KnowledgeBase = {
                id: newKbId,
                kbId: newKbId,
                name: newKbName,
                model: newKbModel || ''
            };

            const response = await fetch('/api/knowledge-bases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kb)
            });

            if (response.ok) {
                addKnowledgeBase(kb);
                setNewKbName('');
                setNewKbId('');
                setNewKbModel('');
            }
        } catch (err) {
            console.error('Failed to add KB', err);
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteKb = async (id: string) => {
        if (!confirm('Are you sure you want to remove this Knowledge Base?')) return;

        try {
            const response = await fetch(`/api/knowledge-bases/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                removeKnowledgeBase(id);
            }
        } catch (err) {
            console.error('Failed to delete KB', err);
        }
    };

    return (
        <div className="max-w-3xl flex flex-col gap-8">
            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>Knowledge Bases</h1>

            {/* List Existing KBs */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Active Knowledge Bases
                </h3>

                {knowledgeBases.length === 0 ? (
                    <div className={cn("p-8 rounded-xl border border-dashed flex flex-col items-center justify-center gap-2", isDarkMode ? "border-white/10" : "border-gray-200")}>
                        <div className="text-2xl">📚</div>
                        <div className={cn("text-sm", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>No Knowledge Bases configured</div>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {knowledgeBases.map(kb => (
                            <div key={kb.id} className={cn(
                                "p-4 rounded-xl border flex items-center justify-between",
                                isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                            )}>
                                <div>
                                    <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>{kb.name}</div>
                                    <div className={cn("text-xs font-mono mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>{kb.id}</div>
                                </div>
                                <button
                                    onClick={() => handleDeleteKb(kb.id)}
                                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                    title="Remove Knowledge Base"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Add New KB */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Add Knowledge Base
                </h3>
                <div className={cn("p-6 rounded-xl border grid gap-4", isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200")}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className={cn("text-xs uppercase font-bold", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>Name</label>
                            <input
                                type="text"
                                placeholder="My Documents"
                                value={newKbName}
                                onChange={e => setNewKbName(e.target.value)}
                                className={cn("p-2 rounded-lg border bg-transparent outline-none focus:ring-2 ring-violet-500", isDarkMode ? "border-white/10 text-white" : "border-gray-200 text-gray-900")}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className={cn("text-xs uppercase font-bold", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>KB ID</label>
                            <input
                                type="text"
                                placeholder="bedrock-kb-id"
                                value={newKbId}
                                onChange={e => setNewKbId(e.target.value)}
                                className={cn("p-2 rounded-lg border bg-transparent outline-none focus:ring-2 ring-violet-500", isDarkMode ? "border-white/10 text-white" : "border-gray-200 text-gray-900")}
                            />
                        </div>
                    </div>
                    <button
                        onClick={handleAddKb}
                        disabled={!newKbName || !newKbId || isAdding}
                        className={cn(
                            "mt-2 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                            !newKbName || !newKbId
                                ? "bg-gray-500/20 text-gray-400 cursor-not-allowed"
                                : "bg-violet-600 hover:bg-violet-700 text-white"
                        )}
                    >
                        {isAdding ? 'Adding...' : 'Add Knowledge Base'}
                    </button>
                    <p className={cn("text-xs text-center", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Configure Bedrock to enable document retrieval for this ID.
                    </p>
                </div>
            </section>
        </div>
    );
}
