'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Play, Square, User, Bot, Sparkles, Activity, Globe, Zap, Droplets, Wind } from 'lucide-react';
import FluidVisualizer from '@/components/intelligence/FluidVisualizer';
import AntiGravityVisualizer from '@/components/intelligence/AntiGravityVisualizer';
import DataConstellationV2Visualizer from '@/components/intelligence/DataConstellationV2Visualizer';
import DataConstellationVisualizer from '@/components/intelligence/DataConstellationVisualizer';
import WaveformVisualizer from '@/components/intelligence/WaveformVisualizer';
import ParticleVortexVisualizer from '@/components/intelligence/ParticleVortexVisualizer';
import { useApp } from '@/lib/context/AppContext';

export default function VisualizerTestPage() {
    // We don't really need AppContext for this harness, but we might need it if visualizers use it.
    // Most visualizers import useApp for settings/theme, so we should wrap or mock if needed.
    // For now, they consume it safely.

    const [isListening, setIsListening] = useState(false);
    const [visualizer, setVisualizer] = useState<'fluid' | 'antigravity' | 'constellation_v2' | 'constellation' | 'wave' | 'particle_vortex'>('fluid');
    const [manualMode, setManualMode] = useState<'idle' | 'user' | 'agent'>('idle');
    const [speed, setSpeed] = useState(0.5);
    const [sensitivity, setSensitivity] = useState(1.0);
    const [audioData, setAudioData] = useState<Uint8Array | null>(null);

    // ... (keep audio ref) ...
    // Audio Ref
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const rafRef = useRef<number>(0);

    // ... (keep toggleMic) ...
    // Start/Stop Mic
    const toggleMic = async () => {
        if (isListening) {
            // Stop
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            setIsListening(false);
            setAudioData(null);
            setManualMode('idle');
        } else {
            // Start
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;

                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);

                audioContextRef.current = audioCtx;
                analyserRef.current = analyser;
                sourceRef.current = source;

                setIsListening(true);
                // Default to 'user' mode when mic starts? or keep manual control?
                // Let's keep manual control, but maybe auto-switch if loud?
                // For a harness, manual buttons are better.

                // Start Loop
                const update = () => {
                    if (!analyser) return;
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);
                    setAudioData(dataArray);
                    rafRef.current = requestAnimationFrame(update);
                };
                update();

            } catch (err) {
                console.error("Mic Error:", err);
                alert("Could not access microphone");
            }
        }
    };

    // Callback for visualizers
    const getAudioData = () => {
        return audioData;
    };

    // Helper for visualizer rendering
    const renderVisualizer = () => {
        const commonProps = {
            isActive: true,
            getAudioData: getAudioData,
            speed: speed,
            sensitivity: sensitivity
        };

        switch (visualizer) {
            case 'fluid':
                return <FluidVisualizer mode={manualMode} getAudioData={getAudioData} speed={speed} sensitivity={sensitivity} />;
            case 'antigravity':
                return <AntiGravityVisualizer {...commonProps} />;
            case 'constellation_v2':
                return <DataConstellationV2Visualizer {...commonProps} />;
            case 'constellation':
                return <DataConstellationVisualizer {...commonProps} />;
            case 'wave':
                return <WaveformVisualizer {...commonProps} />;
            case 'particle_vortex':
                return <ParticleVortexVisualizer {...commonProps} mode={manualMode} />;
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-black text-white p-6 flex flex-col gap-6">
            <header className="flex justify-between items-center border-b border-gray-800 pb-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                    Visualizer Test Harness
                </h1>
                <div className="text-sm text-gray-500">
                    Direct Microphone Feed • Free Testing
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Visualizer Display */}
                <div className="lg:col-span-2 relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl h-[600px] flex items-center justify-center">
                    {!isListening && (
                        <div className="absolute z-10 text-center text-gray-500">
                            <MicOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <div>Microphone Active</div>
                            <div className="text-xs opacity-50">(Visualizer may be idle)</div>
                        </div>
                    )}

                    <div className="w-full h-full">
                        {renderVisualizer()}
                    </div>

                    {/* Overlay Label */}
                    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs font-mono border border-white/10 uppercase tracking-widest">
                        {visualizer} • {manualMode}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-6">

                    {/* 1. Audio Control */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Input Source</h2>
                        <button
                            onClick={toggleMic}
                            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${isListening
                                ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/20'
                                }`}
                        >
                            {isListening ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                            {isListening ? "STOP MICROPHONE" : "START MICROPHONE"}
                        </button>
                    </div>

                    {/* 2. Visualizer Selection */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Visualizer</h2>
                        <div className="grid grid-cols-1 gap-2">
                            {[
                                { id: 'fluid', label: 'Fluid Physics (Ink)', icon: Droplets },
                                { id: 'antigravity', label: 'Anti-Gravity', icon: Sparkles },
                                { id: 'constellation_v2', label: 'Constellation V2', icon: Globe },
                                { id: 'constellation', label: 'Constellation V1', icon: Activity },
                                { id: 'wave', label: 'Simple Waveform', icon: Zap },
                                { id: 'particle_vortex', label: 'Particle Vortex', icon: Wind },
                            ].map((v) => (
                                <button
                                    key={v.id}
                                    onClick={() => setVisualizer(v.id as any)}
                                    className={`px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${visualizer === v.id
                                        ? 'bg-white text-black font-medium'
                                        : 'bg-black/40 text-gray-400 hover:bg-white/5'
                                        }`}
                                >
                                    <v.icon className={`w-4 h-4 ${visualizer === v.id ? 'text-black' : 'text-gray-500'}`} />
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. Mode Simulation */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Simulation Mode</h2>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setManualMode('idle')}
                                className={`p-3 rounded-lg flex flex-col items-center gap-2 text-xs transition-colors ${manualMode === 'idle' ? 'bg-gray-700 text-white' : 'bg-black/40 text-gray-500'
                                    }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-gray-500" />
                                Idle
                            </button>
                            <button
                                onClick={() => setManualMode('user')}
                                className={`p-3 rounded-lg flex flex-col items-center gap-2 text-xs transition-colors ${manualMode === 'user' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/30' : 'bg-black/40 text-gray-500'
                                    }`}
                            >
                                <User className="w-4 h-4" />
                                User (Listening)
                            </button>
                            <button
                                onClick={() => setManualMode('agent')}
                                className={`p-3 rounded-lg flex flex-col items-center gap-2 text-xs transition-colors ${manualMode === 'agent' ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30' : 'bg-black/40 text-gray-500'
                                    }`}
                            >
                                <Bot className="w-4 h-4" />
                                Agent (Speaking)
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                            * <strong>User</strong>: Triggers "Cyan/Blue" themes (recording).
                            <br />
                            * <strong>Agent</strong>: Triggers "Magenta/Gold" themes (speaking).
                        </p>
                    </div>

                    {/* 4. Fine Tuning */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Physics Tuning</h2>

                        <div className="mb-4">
                            <div className="flex justify-between text-xs mb-2">
                                <span className="text-gray-400">Time Speed</span>
                                <span className="text-cyan-400">{speed.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.0"
                                max="2.0"
                                step="0.05"
                                value={speed}
                                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs mb-2">
                                <span className="text-gray-400">Audio Sensitivity</span>
                                <span className="text-purple-400">{sensitivity.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.0"
                                max="3.0"
                                step="0.1"
                                value={sensitivity}
                                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
