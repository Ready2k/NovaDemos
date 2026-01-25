import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';

import { useEffect, useState } from 'react';

export default function GeneralSettings() {
    const { settings, updateSettings, isDarkMode } = useApp();
    const [voices, setVoices] = useState([
        { id: 'matthew', label: 'Matthew (US Male)' },
        { id: 'ruth', label: 'Ruth (US Female)' }, // Added more fallbacks
        { id: 'stephen', label: 'Stephen (US Male)' },
        { id: 'danielle', label: 'Danielle (US Female)' },
        { id: 'joanna', label: 'Joanna (US Female)' },
        { id: 'joey', label: 'Joey (US Male)' },
        { id: 'justin', label: 'Justin (US Male)' },
        { id: 'kendra', label: 'Kendra (US Female)' },
        { id: 'kimberly', label: 'Kimberly (US Female)' },
        { id: 'salli', label: 'Salli (US Female)' },
        { id: 'amy', label: 'Amy (GB Female)' },
        { id: 'arthur', label: 'Arthur (GB Male)' },
        { id: 'brian', label: 'Brian (GB Male)' },
        { id: 'emma', label: 'Emma (GB Female)' },
        { id: 'nicole', label: 'Nicole (AU Female)' },
        { id: 'russell', label: 'Russell (AU Male)' },
        { id: 'florian', label: 'Florian (FR Male)' },
        { id: 'ambre', label: 'Ambre (FR Female)' },
    ]);

    // Fetch voices from backend
    useEffect(() => {
        const fetchVoices = async () => {
            try {
                const response = await fetch('/api/voices');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setVoices(data.map((v: any) => ({
                            id: v.id, // Ensure ID matches backend
                            label: v.name || v.id
                        })));
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch voices', err);
            }
        };
        fetchVoices();
    }, []);

    const voicePresets = voices;

    const brainModes = [
        { id: 'raw_nova', label: 'Raw Nova (Fastest, Direct LLM)' },
        { id: 'agent', label: 'Bedrock Agent (Tools & Workflows)' },
    ];

    return (
        <div className="max-w-2xl flex flex-col gap-8">
            <h1 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-gray-900")}>General Settings</h1>

            {/* Interaction Mode */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Interaction Mode
                </h3>
                <select
                    value={settings.interactionMode || 'chat_voice'}
                    onChange={(e) => updateSettings({ interactionMode: e.target.value as any })}
                    className={cn(
                        "w-full p-3 rounded-xl appearance-none border transition-colors outline-none",
                        isDarkMode
                            ? "bg-white/5 border-white/10 text-white focus:border-violet-500"
                            : "bg-white border-gray-200 text-gray-900 focus:border-violet-500"
                    )}
                >
                    <option value="chat_voice">✨ Chat + Voice</option>
                    <option value="voice_only">🎤 Voice Only</option>
                    <option value="chat_only">💬 Chat Only</option>
                </select>
            </section>

            {/* Brain Mode Selection */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Brain Mode
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {brainModes.map(mode => (
                        <button
                            key={mode.id}
                            onClick={() => updateSettings({ brainMode: mode.id as any })}
                            className={cn(
                                "p-4 rounded-xl border text-left transition-all",
                                settings.brainMode === mode.id
                                    ? isDarkMode
                                        ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                        : "border-violet-500 bg-violet-50 shadow-md"
                                    : isDarkMode
                                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                                        : "border-gray-200 bg-white hover:bg-gray-50"
                            )}>
                            <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>{mode.label}</div>
                            <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                                {mode.id === 'raw_nova' ? 'Low latency, conversational' : 'Access to RAG and tools'}
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* Voice Selection */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Voice Preset
                </h3>
                <select
                    value={settings.voicePreset}
                    onChange={(e) => updateSettings({ voicePreset: e.target.value })}
                    className={cn(
                        "w-full p-3 rounded-xl appearance-none border transition-colors outline-none",
                        isDarkMode
                            ? "bg-white/5 border-white/10 text-white focus:border-violet-500"
                            : "bg-white border-gray-200 text-gray-900 focus:border-violet-500"
                    )}
                >
                    {voicePresets.map(voice => (
                        <option key={voice.id} value={voice.id}>
                            {/* Check mark logic not trivial in select, simplistic render for now */}
                            {voice.label}
                        </option>
                    ))}
                </select>
            </section>

            {/* Interaction Mode */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Interaction Style
                </h3>
                <div className={cn("p-4 rounded-xl border flex items-center justify-between", isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200 bg-white")}>
                    <div>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Guardrails Enabled</div>
                        <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>Filter harmful content and PII</div>
                    </div>
                    <button
                        onClick={() => updateSettings({ enableGuardrails: !settings.enableGuardrails })}
                        className={cn(
                            "w-12 h-6 rounded-full transition-colors relative",
                            settings.enableGuardrails ? "bg-emerald-500" : "bg-gray-600"
                        )}
                    >
                        <div className={cn(
                            "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                            settings.enableGuardrails ? "left-7" : "left-1"
                        )} />
                    </button>
                </div>
            </section>

            {/* Visualization Style */}
            <section className="flex flex-col gap-4">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Visualization Style
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => updateSettings({ visualizationStyle: 'simple_wave' })}
                        className={cn(
                            "p-4 rounded-xl border text-left transition-all",
                            (settings.visualizationStyle === 'simple_wave' || !settings.visualizationStyle)
                                ? isDarkMode
                                    ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                    : "border-violet-500 bg-violet-50 shadow-md"
                                : isDarkMode
                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                        )}>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Simple Wave</div>
                        <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            Classic waveform visualization
                        </div>
                    </button>

                    <button
                        onClick={() => updateSettings({ visualizationStyle: 'anti_gravity' })}
                        className={cn(
                            "p-4 rounded-xl border text-left transition-all",
                            settings.visualizationStyle === 'anti_gravity'
                                ? isDarkMode
                                    ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                    : "border-violet-500 bg-violet-50 shadow-md"
                                : isDarkMode
                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                        )}>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Anti-Gravity</div>
                        <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            Mesmerizing organic particle sphere
                        </div>
                    </button>

                    <button
                        onClick={() => updateSettings({ visualizationStyle: 'fluid_physics' })}
                        className={cn(
                            "p-4 rounded-xl border text-left transition-all md:col-span-2",
                            settings.visualizationStyle === 'fluid_physics'
                                ? isDarkMode
                                    ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                    : "border-violet-500 bg-violet-50 shadow-md"
                                : isDarkMode
                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                        )}>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Fluid Physics</div>
                        <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            Real-time GPU fluid dynamics (GLSL)
                        </div>
                    </button>

                    <button
                        onClick={() => updateSettings({ visualizationStyle: 'particle_vortex' })}
                        className={cn(
                            "p-4 rounded-xl border text-left transition-all md:col-span-2",
                            settings.visualizationStyle === 'particle_vortex'
                                ? isDarkMode
                                    ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                    : "border-violet-500 bg-violet-50 shadow-md"
                                : isDarkMode
                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                        )}>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Particle Vortex</div>
                        <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            Hybrid 3D Constellation & Vortex
                        </div>
                    </button>
                </div>
            </section>
        </div>
    );
}
