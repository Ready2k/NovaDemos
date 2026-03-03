'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { cn } from '@/lib/utils';

interface SbcConfig {
    voice:        string;
    persona:      string;
    workflow:     string;
    enabledTools: string[];
}

const DEFAULTS: SbcConfig = {
    voice:        'amy',
    persona:      'BankingDisputes',
    workflow:     'disputes',
    enabledTools: [],
};

export default function SbcSettings() {
    const { isDarkMode, showToast } = useApp();

    const [config, setConfig]   = useState<SbcConfig>(DEFAULTS);
    const [saving, setSaving]   = useState(false);
    const [loading, setLoading] = useState(true);

    // Option lists
    const [voices, setVoices]       = useState<{ id: string; label: string }[]>([]);
    const [personas, setPersonas]   = useState<{ id: string; name: string }[]>([]);
    const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);

    // Fetch current config + option lists on mount
    useEffect(() => {
        const load = async () => {
            try {
                const [cfgRes, voiceRes, personaRes, wfRes] = await Promise.all([
                    fetch('/api/sbc-config'),
                    fetch('/api/voices'),
                    fetch('/api/personas'),
                    fetch('/api/workflows'),
                ]);

                if (cfgRes.ok) {
                    setConfig(await cfgRes.json());
                }
                if (voiceRes.ok) {
                    const data = await voiceRes.json();
                    setVoices(Array.isArray(data)
                        ? data.map((v: any) => ({ id: v.id, label: v.name || v.id }))
                        : []
                    );
                }
                if (personaRes.ok) {
                    const data = await personaRes.json();
                    setPersonas(Array.isArray(data) ? data : []);
                }
                if (wfRes.ok) {
                    const data = await wfRes.json();
                    setWorkflows(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.warn('[SbcSettings] Failed to load options:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/sbc-config', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(config),
            });
            if (res.ok) {
                showToast('Phone settings saved — applies to next incoming call', 'success');
            } else {
                showToast('Failed to save phone settings', 'error');
            }
        } catch (e) {
            showToast('Failed to save phone settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const selectClass = cn(
        'w-full p-3 rounded-xl appearance-none border transition-colors outline-none',
        isDarkMode
            ? 'bg-white/5 border-white/10 text-white focus:border-violet-500'
            : 'bg-white border-gray-200 text-gray-900 focus:border-violet-500'
    );

    const labelClass = cn(
        'text-sm font-semibold uppercase tracking-wider',
        isDarkMode ? 'text-ink-text-muted' : 'text-gray-500'
    );

    if (loading) {
        return (
            <div className="max-w-2xl flex items-center justify-center py-20">
                <span className={cn('text-sm', isDarkMode ? 'text-white/40' : 'text-gray-400')}>Loading…</span>
            </div>
        );
    }

    return (
        <div className="max-w-2xl flex flex-col gap-8">
            <div>
                <h1 className={cn('text-2xl font-bold', isDarkMode ? 'text-white' : 'text-gray-900')}>
                    Phone Settings
                </h1>
                <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/40' : 'text-gray-500')}>
                    These settings apply to the next incoming phone call.
                </p>
            </div>

            {/* Voice */}
            <section className="flex flex-col gap-4">
                <h3 className={labelClass}>Voice</h3>
                <select
                    value={config.voice}
                    onChange={e => setConfig(c => ({ ...c, voice: e.target.value }))}
                    className={selectClass}
                >
                    {voices.length > 0
                        ? voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)
                        : <option value={config.voice}>{config.voice}</option>
                    }
                </select>
            </section>

            {/* Persona */}
            <section className="flex flex-col gap-4">
                <h3 className={labelClass}>Persona</h3>
                <select
                    value={config.persona}
                    onChange={e => setConfig(c => ({ ...c, persona: e.target.value }))}
                    className={selectClass}
                >
                    {personas.length > 0
                        ? personas.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name || p.id}
                            </option>
                          ))
                        : <option value={config.persona}>{config.persona}</option>
                    }
                </select>
            </section>

            {/* Workflow */}
            <section className="flex flex-col gap-4">
                <h3 className={labelClass}>Workflow</h3>
                <select
                    value={config.workflow}
                    onChange={e => setConfig(c => ({ ...c, workflow: e.target.value }))}
                    className={selectClass}
                >
                    <option value="">— None —</option>
                    {workflows.length > 0
                        ? workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)
                        : <option value={config.workflow}>{config.workflow}</option>
                    }
                </select>
            </section>

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                    'self-start px-6 py-3 rounded-xl font-semibold text-sm transition-all',
                    saving
                        ? 'opacity-50 cursor-not-allowed'
                        : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg hover:shadow-violet-500/30'
                )}
            >
                {saving ? 'Saving…' : 'Save Phone Settings'}
            </button>
        </div>
    );
}
