
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import Toast from '@/components/ui/Toast';

interface Preset {
    id: string;
    name: string;
    createdAt: string;
    config: any;
}

export default function PresetsSettings() {
    const { settings, updateSettings, isDarkMode, showToast } = useApp();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [newPresetName, setNewPresetName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Fetch presets on mount
    const fetchPresets = async () => {
        try {
            // Add timestamp to prevent caching
            const response = await fetch(`/api/presets?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setPresets(data);
            }
        } catch (err) {
            console.error('Failed to fetch presets', err);
            showToast('Failed to load presets', 'error');
        }
    };

    useEffect(() => {
        fetchPresets();
    }, []);

    const handleSaveCurrentConfig = async () => {
        if (!newPresetName.trim()) {
            showToast('Please enter a name for the preset', 'error');
            return;
        }

        setIsLoading(true);
        try {
            // Snapshot relevant settings
            const configToSave = {
                interactionMode: settings.interactionMode,
                brainMode: settings.brainMode,
                voicePreset: settings.voicePreset,
                personaPreset: settings.personaPreset,
                systemPrompt: settings.systemPrompt,
                speechPrompt: settings.speechPrompt,
                enabledTools: settings.enabledTools,
                linkedWorkflows: settings.linkedWorkflows,
                costConfig: settings.costConfig, // Optional, but good to preserve
            };

            const response = await fetch('/api/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newPresetName.trim(),
                    config: configToSave
                }),
                cache: 'no-store'
            });

            if (response.ok) {
                showToast('Configuration saved successfully', 'success');
                setNewPresetName('');
                fetchPresets(); // Refresh list
            } else {
                throw new Error('Failed to save');
            }
        } catch (err) {
            console.error('Failed to save preset', err);
            showToast('Failed to save preset', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadPreset = (preset: Preset) => {
        // Apply settings
        updateSettings(preset.config);
        showToast(`Loaded preset: ${preset.name}`, 'success');
    };

    const handleDeleteClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (deleteConfirmId === id) {
            // Second click - actually delete
            handleDeletePreset(id);
            setDeleteConfirmId(null);
        } else {
            // First click - show confirmation
            setDeleteConfirmId(id);
            // Auto-reset confirmation after 3 seconds
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    };

    const handleDeletePreset = async (id: string) => {
        // Optimistic update: Remove immediately from UI
        const previousPresets = [...presets];
        setPresets(presets.filter(p => p.id !== id));

        try {
            const response = await fetch(`/api/presets/${id}?t=${Date.now()}`, {
                method: 'DELETE',
                cache: 'no-store'
            });
            if (response.ok) {
                showToast('Preset deleted', 'success');
            } else {
                console.error('Delete failed details:', response.status, response.statusText);
                setPresets(previousPresets);
                showToast(`Delete failed: ${response.status} ${response.statusText}`, 'error');
            }
        } catch (err: any) {
            console.error('Failed to delete preset', err);
            showToast(`Error deleting: ${err.message}`, 'error');
            setPresets(previousPresets);
        }
    };

    return (
        <div className="max-w-2xl flex flex-col gap-8">
            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                Configuration Presets
            </h1>

            {/* Create New Preset */}
            <section className={cn(
                "p-6 rounded-xl border flex flex-col gap-4 transition-colors",
                isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            )}>
                <h3 className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                    Save Current Configuration
                </h3>
                <p className={cn("text-sm mb-2", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Save your current Voice, Persona, Workflow, and System Prompts as a reusable preset.
                </p>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="e.g. Banking Dispute Mode"
                        className={cn(
                            "flex-1 p-3 rounded-lg border outline-none transition-colors",
                            isDarkMode
                                ? "bg-black/20 border-white/10 text-white placeholder-white/30 focus:border-violet-500"
                                : "bg-gray-50 border-gray-200 text-gray-900 focus:border-violet-500"
                        )}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentConfig()}
                    />
                    <button
                        onClick={handleSaveCurrentConfig}
                        disabled={isLoading || !newPresetName.trim()}
                        className={cn(
                            "px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                            "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-lg hover:from-violet-500 hover:to-fuchsia-500"
                        )}
                    >
                        {isLoading ? 'Saving...' : 'Save Preset'}
                    </button>
                </div>
            </section>

            {/* Saved Presets List */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Saved Presets
                </h3>

                {presets.length === 0 ? (
                    <div className={cn(
                        "p-8 text-center rounded-xl border border-dashed",
                        isDarkMode ? "border-white/10 text-ink-text-muted" : "border-gray-200 text-gray-400"
                    )}>
                        No presets saved yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {presets.map(preset => (
                            <div
                                key={preset.id}
                                className={cn(
                                    "p-4 rounded-xl border transition-all group flex items-center justify-between",
                                    isDarkMode
                                        ? "bg-white/5 border-white/10 hover:border-violet-500/50 hover:bg-white/10"
                                        : "bg-white border-gray-200 hover:border-violet-300 hover:shadow-sm"
                                )}
                            >
                                <div className="flex-1">
                                    <div className={cn("font-medium text-lg", isDarkMode ? "text-white" : "text-gray-900")}>
                                        {preset.name}
                                    </div>
                                    <div className={cn("text-xs mt-1 flex gap-2", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                                        <span>{new Date(preset.createdAt).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span className="capitalize">{preset.config.interactionMode?.replace('_', ' + ') || 'Default'}</span>
                                        <span>•</span>
                                        <span className="capitalize">{preset.config.brainMode === 'raw_nova' ? 'Raw Nova' : 'Agent'}</span>
                                        {preset.config.voicePreset && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize">{preset.config.voicePreset}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleLoadPreset(preset)}
                                        className={cn(
                                            "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                                            isDarkMode
                                                ? "border-violet-500/30 text-violet-300 hover:bg-violet-500/20"
                                                : "border-violet-200 text-violet-700 hover:bg-violet-50"
                                        )}
                                    >
                                        Load
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteClick(preset.id, e)}
                                        className={cn(
                                            "p-2 rounded-lg transition-all flex items-center gap-2",
                                            deleteConfirmId === preset.id
                                                ? "bg-red-500 text-white w-auto px-3 opacity-100"
                                                : "text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        )}
                                        title={deleteConfirmId === preset.id ? "Confirm Delete" : "Delete Preset"}
                                    >
                                        {deleteConfirmId === preset.id ? (
                                            <span className="text-xs font-bold whitespace-nowrap">Confirm?</span>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
