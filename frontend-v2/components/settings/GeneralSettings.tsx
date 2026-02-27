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
                        onClick={() => updateSettings({ visualizationStyle: 'pulse_waveform' })}
                        className={cn(
                            "p-4 rounded-xl border text-left transition-all",
                            settings.visualizationStyle === 'pulse_waveform'
                                ? isDarkMode
                                    ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                    : "border-violet-500 bg-violet-50 shadow-md"
                                : isDarkMode
                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                    : "border-gray-200 bg-white hover:bg-gray-50"
                        )}>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Pulse Waveform</div>
                        <div className={cn("text-xs mt-1", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                            Reactive pulse with dynamic events
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
                            "p-4 rounded-xl border text-left transition-all",
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

            {/* Visualizer Tuning */}
            <section className="flex flex-col gap-6 pt-4 border-t border-white/5">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Visualizer Tuning
                </h3>

                {/* Speed */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Time Speed</span>
                        <span className="text-gray-500">{settings.physicsSpeed?.toFixed(2) || '1.00'}</span>
                    </div>
                    <input
                        type="range" min="0.1" max="5.0" step="0.05"
                        value={settings.physicsSpeed ?? 1.0}
                        onChange={(e) => updateSettings({ physicsSpeed: parseFloat(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                    />
                </div>

                {/* Sensitivity */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Audio Sensitivity</span>
                        <span className="text-gray-500">{settings.physicsSensitivity?.toFixed(2) || '1.00'}</span>
                    </div>
                    <input
                        type="range" min="0.1" max="5.0" step="0.05"
                        value={settings.physicsSensitivity ?? 1.0}
                        onChange={(e) => updateSettings({ physicsSensitivity: parseFloat(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                    />
                </div>

                {/* Context Growth */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Context Growth</span>
                        <span className="text-gray-500">{Math.round((settings.contextGrowth || 0) * 100)}%</span>
                    </div>
                    <input
                        type="range" min="0" max="1" step="0.01"
                        value={settings.contextGrowth ?? 0}
                        onChange={(e) => updateSettings({ contextGrowth: parseFloat(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>
            </section>

            {/* Inactivity Detection */}
            <section className="flex flex-col gap-6 pt-4 border-t border-white/5">
                <h3 className={cn("text-sm font-semibold uppercase tracking-wider", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                    Inactivity Detection
                </h3>

                {/* Enable/Disable Toggle */}
                <div className={cn("p-4 rounded-xl border flex items-center justify-between", isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200 bg-white")}>
                    <div>
                        <div className={cn("font-medium", isDarkMode ? "text-white" : "text-gray-900")}>Enable Inactivity Checks</div>
                        <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>AI checks in if user is silent</div>
                    </div>
                    <button
                        onClick={() => updateSettings({ inactivityEnabled: !settings.inactivityEnabled })}
                        className={cn(
                            "w-12 h-6 rounded-full transition-colors relative",
                            settings.inactivityEnabled !== false ? "bg-emerald-500" : "bg-gray-600"
                        )}
                    >
                        <div className={cn(
                            "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                            settings.inactivityEnabled !== false ? "left-7" : "left-1"
                        )} />
                    </button>
                </div>

                {/* Timeout Slider */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Check-in Timeout</span>
                        <span className="text-gray-500">{settings.inactivityTimeout ?? 20}s</span>
                    </div>
                    <input
                        type="range" min="5" max="50" step="5"
                        value={settings.inactivityTimeout ?? 20}
                        onChange={(e) => updateSettings({ inactivityTimeout: parseInt(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                        disabled={settings.inactivityEnabled === false}
                    />
                    <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Time before AI checks if user is still there
                    </div>
                </div>

                {/* Max Checks Slider */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? "text-white" : "text-gray-900"}>Max Check-ins</span>
                        <span className="text-gray-500">{settings.inactivityMaxChecks ?? 3}</span>
                    </div>
                    <input
                        type="range" min="1" max="5" step="1"
                        value={settings.inactivityMaxChecks ?? 3}
                        onChange={(e) => updateSettings({ inactivityMaxChecks: parseInt(e.target.value) })}
                        className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-violet-500"
                        disabled={settings.inactivityEnabled === false}
                    />
                    <div className={cn("text-xs", isDarkMode ? "text-ink-text-muted" : "text-gray-500")}>
                        Number of check-ins before ending session
                    </div>
                </div>
            </section>
        </div>
    );
}
