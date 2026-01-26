'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface WaveformVisualizerProps {
    isActive?: boolean;
    isThinking?: boolean;
    mode?: 'idle' | 'user' | 'agent';
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
    growth?: number;
    isToolActive?: boolean;
}

const THEMES = {
    user: { primary: '#06b6d4', secondary: '#10b981', accent: '#22d3ee' },
    agent: { primary: '#8b5cf6', secondary: '#d946ef', accent: '#f59e0b' },
    idle: { primary: '#64748b', secondary: '#94a3b8', accent: '#cbd5e1' }
};

export default function PulseWaveformVisualizer({
    isActive = true,
    isThinking = false,
    mode = 'idle',
    getAudioData,
    speed = 1.0,
    sensitivity = 1.0,
    growth = 0,
    isToolActive = false,
}: WaveformVisualizerProps) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const volumeRef = useRef(0);
    const pulseRef = useRef(0);
    const growthRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let globalPhase = 0;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 2;
                const rect = parent.getBoundingClientRect();
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
            }
        };

        window.addEventListener('resize', resize);
        resize();

        const draw = () => {
            const dpr = window.devicePixelRatio || 2;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            if (!width || !height) return;

            const centerY = height / 2;
            ctx.clearRect(0, 0, width, height);

            let currentVol = 0;
            if (isActive && getAudioData && !isThinking) {
                const data = getAudioData();
                if (data) {
                    const sample = data.slice(5, 60); // Broader range
                    // Normalize: 255 is max value. Length is ~55.
                    currentVol = (sample.reduce((a, b) => a + b, 0) / (sample.length * 255)) * sensitivity;
                }
            } else if (isThinking) {
                currentVol = 0.15 + Math.sin(globalPhase * 0.2) * 0.05;
            }

            volumeRef.current = volumeRef.current * 0.85 + currentVol * 0.15;
            growthRef.current = growthRef.current * 0.95 + growth * 0.05;
            const v = volumeRef.current;
            const g = growthRef.current;
            pulseRef.current = (pulseRef.current + (isThinking ? 0.005 : 0.01) * speed) % 1;

            const colors = THEMES[mode as keyof typeof THEMES] || THEMES.idle;
            ctx.globalCompositeOperation = isDarkMode ? 'screen' : 'multiply';

            const renderLayer = (amplitude: number, freq: number, phaseShift: number, color: string, thickness: number, divergence: number = 0, isTool: boolean = false) => {
                ctx.beginPath();

                // Pulse Gradient Logic for Agent
                let strokeStyle: string | CanvasGradient = color;
                if (mode === 'agent' && divergence === 0 && !isTool) {
                    const grad = ctx.createLinearGradient(0, 0, width, 0);
                    const p = pulseRef.current;
                    grad.addColorStop(Math.max(0, p - 0.2), color);
                    grad.addColorStop(p, '#ffffff');
                    grad.addColorStop(Math.min(1, p + 0.2), color);
                    strokeStyle = grad;
                }

                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = thickness;
                ctx.shadowBlur = (isThinking ? 4 : 12 * v);
                ctx.shadowColor = color;
                if (isTool) {
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#fbbf24';
                }

                for (let x = 0; x <= width; x += 4) {
                    const normX = x / width;
                    const taper = Math.pow(Math.sin(normX * Math.PI), 2);

                    let yOffset;
                    if (isThinking && !isTool) {
                        // High-frequency jitter
                        yOffset = (Math.sin(x * 0.05 + globalPhase * 5) * 4) * (0.5 + v);
                    } else if (isTool) {
                        // Tool / Data Stream: Fast, tight, slightly square
                        const toolWave = Math.sin(x * 0.1 + globalPhase * 10);
                        yOffset = toolWave * (5 + v * 10);
                        // Add digital noise
                        if (Math.random() > 0.9) yOffset += (Math.random() - 0.5) * 5;
                    } else {
                        // Main wave with divergence for "fiber" effect
                        const wave = Math.sin(x * freq + globalPhase + phaseShift + (x * divergence * v * 0.002));

                        // Reactivity Boost: 
                        // Base Idle = 3px. 
                        // Signal = v * height * 0.8. (e.g. 0.3 * 84 * 0.8 = 20px)
                        const signal = v * height * 0.8;
                        const base = 3;

                        yOffset = wave * (amplitude * (signal + base));
                    }

                    const y = centerY + (yOffset * taper);
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            };

            // 0. Context Growth (Harmonics)
            if (g > 0.1) {
                renderLayer(1.2, 0.003, globalPhase * 0.5, colors.secondary + '11', 20 * g); // Wide faint band
                renderLayer(0.8, 0.006, globalPhase + Math.PI, colors.accent + '22', 4, 0.2); // Counter-wave
            }

            // 1. Wide Glow Underlay
            renderLayer(0.8, 0.005, 0, colors.secondary + '22', 12);

            // 2. The "Fiber" Core - 3 lines that diverge slightly as volume increases
            const coreColor = isDarkMode ? '#ffffff' : colors.primary;
            // Center Line
            renderLayer(0.6, 0.008, Math.PI, coreColor, 2, 0);

            // Sub-strands (only visible when active/thinking)
            if (v > 0.05) {
                renderLayer(0.6, 0.008, Math.PI, colors.accent + '88', 1, 0.5);
                renderLayer(0.6, 0.008, Math.PI, colors.secondary + '88', 1, -0.5);
            }

            // 4. Tool Data Stream (Overlay)
            if (isToolActive) {
                renderLayer(0, 0, 0, '#fbbf24', 1.5, 0, true);
            }

            globalPhase += isThinking ? 0.2 : 0.1 * speed;
            animationId = requestAnimationFrame(draw);
        };

        draw();
        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
        };
    }, [isActive, isThinking, mode, getAudioData, isDarkMode, speed, sensitivity, growth, isToolActive]);

    return (
        <div className="relative flex items-center justify-center overflow-hidden w-full h-full">
            <canvas ref={canvasRef} className="w-full h-full drop-shadow-lg" />
        </div>
    );
}