import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function PersonaSettings() {
    const { settings, updateSettings, isDarkMode, showToast } = useApp();
    const [localSystemPrompt, setLocalSystemPrompt] = useState(settings.systemPrompt);
    const [localSpeechPrompt, setLocalSpeechPrompt] = useState(settings.speechPrompt);
    const [prompts, setPrompts] = useState<any[]>([]);
    const [selectedPromptId, setSelectedPromptId] = useState<string>(settings.personaPreset || '');
    const [workflows, setWorkflows] = useState<any[]>([]);
    // Removed local linkedWorkflows state to rely on global settings for persistence
    const [isSyncing, setIsSyncing] = useState(false);

    // Sync selectedPromptId when settings change (e.g. initial load or external update)
    useEffect(() => {
        if (settings.personaPreset) {
            setSelectedPromptId(settings.personaPreset);
        }
    }, [settings.personaPreset]);

    // Fetch prompts from backend
    useEffect(() => {
        const fetchPrompts = async () => {
            try {
                const response = await fetch('/api/prompts');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        setPrompts(data);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch prompts', err);
            }
        };
        fetchPrompts();
    }, []);

    // Fetch Workflows
    useEffect(() => {
        const fetchWorkflows = async () => {
            try {
                const response = await fetch('/api/workflows');
                if (response.ok) {
                    setWorkflows(await response.json());
                }
            } catch (err) {
                console.warn('Failed to fetch workflows', err);
            }
        };
        fetchWorkflows();
    }, []);

    // Handle Preset Selection
    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedPromptId(id);

        const selected = prompts.find(p => p.id === id);
        if (selected) {
            setLocalSystemPrompt(selected.content);
            // setLinkedWorkflows removed - updating settings directly below

            updateSettings({
                systemPrompt: selected.content,
                personaPreset: id,
                linkedWorkflows: selected.config?.linkedWorkflows || []
            });
        }
    };

    // Handle Sync from Langfuse
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/prompts/sync', { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                // Refresh list
                const listResp = await fetch('/api/prompts');
                if (listResp.ok) {
                    setPrompts(await listResp.json());
                    showToast('Prompts successfully synced!', 'success');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn('Sync endpoint failed:', response.status, errorData);
                showToast(`Sync failed: ${errorData.error || response.statusText}`, 'error');
            }
        } catch (error: any) {
            console.error('Sync failed', error);
            showToast(`Sync failed: ${error.message}`, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    // Sync local state when settings change (e.g. on load)
    useEffect(() => {
        setLocalSystemPrompt(settings.systemPrompt);
        setLocalSpeechPrompt(settings.speechPrompt);
    }, [settings.systemPrompt, settings.speechPrompt]);

    const handleSave = async () => {
        // 1. Update local settings state (for immediate effect in current session)
        updateSettings({
            systemPrompt: localSystemPrompt,
            speechPrompt: localSpeechPrompt,
            // linkedWorkflows is already updated in real-time
        });

        // 2. Persist to Backend (for permanent storage)
        if (selectedPromptId) {
            try {
                const payload = {
                    name: selectedPromptId,
                    content: localSystemPrompt,
                    config: {
                        linkedWorkflows: settings.linkedWorkflows || []
                        // Add other config fields here if needed in future
                    }
                };

                const response = await fetch('/api/prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    showToast('Settings and Workflow links saved!', 'success');
                } else {
                    throw new Error('Failed to save to backend');
                }
            } catch (err) {
                console.error('Failed to save settings:', err);
                showToast('Saved to session, but failed to persist to backend.', 'error');
            }
        } else {
            showToast('Settings updated for this session.', 'info');
        }
    };

    return (
        <div className="max-w-3xl flex flex-col gap-8">
            <div className="flex justify-between items-center">
                <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>Persona Settings</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            isDarkMode
                                ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                                : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700",
                            isSyncing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Langfuse'}
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Persona Preset Selection */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Load Preset
                </h3>
                <select
                    value={selectedPromptId}
                    onChange={handlePresetChange}
                    className={cn(
                        "w-full p-3 rounded-xl appearance-none border transition-colors outline-none",
                        isDarkMode
                            ? "bg-white/5 border-white/10 text-white focus:border-violet-500"
                            : "bg-white border-gray-200 text-gray-900 focus:border-violet-500"
                    )}
                >
                    <option value="">Select a persona...</option>
                    {prompts.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.source === 'langfuse' ? '☁️' : '💾'} {p.name || p.id}
                        </option>
                    ))}
                </select>
            </section>

            {/* System Prompt */}
            <section className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                    <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        System Prompt
                    </h3>
                    <span className={cn("text-xs opacity-60", isDarkMode ? "text-white" : "text-gray-600")}>
                        Defines the AI's personality and instructions
                    </span>
                </div>
                <textarea
                    value={localSystemPrompt}
                    onChange={(e) => setLocalSystemPrompt(e.target.value)}
                    className={cn(
                        "w-full h-64 p-4 rounded-xl text-sm font-mono leading-relaxed resize-y border focus:ring-2 ring-violet-500 outline-none transition-all",
                        isDarkMode
                            ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                            : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
                    )}
                    placeholder="You are a helpful assistant..."
                />
            </section>

            {/* Linked Workflows */}
            <section className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                    <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Linked Workflows
                    </h3>
                    <span className={cn("text-xs opacity-60", isDarkMode ? "text-white" : "text-gray-600")}>
                        Automatically start these workflows with this persona
                    </span>
                </div>
                <div className={cn(
                    "w-full p-4 rounded-xl border flex flex-col gap-2 max-h-48 overflow-y-auto",
                    isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                )}>
                    {workflows.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No workflows found.</p>
                    )}
                    {workflows.map(wf => (
                        <label key={wf.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                            <input
                                type="checkbox"
                                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                checked={(settings.linkedWorkflows || []).includes(wf.id)}
                                onChange={(e) => {
                                    const currentLinks = settings.linkedWorkflows || [];
                                    if (e.target.checked) {
                                        updateSettings({ linkedWorkflows: [...currentLinks, wf.id] });
                                    } else {
                                        updateSettings({ linkedWorkflows: currentLinks.filter(id => id !== wf.id) });
                                    }
                                }}
                            />
                            <span className={cn("text-sm font-medium", isDarkMode ? "text-white" : "text-gray-700")}>
                                {wf.name}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                                {wf.filename}
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            {/* Speech Prompt */}
            <section className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                    <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Speech Style (Optional)
                    </h3>
                    <span className={cn("text-xs opacity-60", isDarkMode ? "text-white" : "text-gray-600")}>
                        Instructions specifically for how the AI speaks
                    </span>
                </div>
                <textarea
                    value={localSpeechPrompt}
                    onChange={(e) => setLocalSpeechPrompt(e.target.value)}
                    className={cn(
                        "w-full h-32 p-4 rounded-xl text-sm font-mono leading-relaxed resize-y border focus:ring-2 ring-violet-500 outline-none transition-all",
                        isDarkMode
                            ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                            : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
                    )}
                    placeholder="Speak fast and excited..."
                />
            </section>
        </div>
    );
}
