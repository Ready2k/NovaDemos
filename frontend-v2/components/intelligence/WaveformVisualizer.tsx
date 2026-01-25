'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface WaveformVisualizerProps {
    isActive?: boolean;
    isThinking?: boolean; // New prop
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
}

export default function WaveformVisualizer({
    isActive = true,
    isThinking = false,
    mode = 'idle', // 'idle' | 'user' | 'agent'
    getAudioData,
    speed = 1.0,
    sensitivity = 1.0
}: WaveformVisualizerProps & { mode?: 'idle' | 'user' | 'agent' }) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const volumeRef = useRef(0);
    const thinkingBuffer = useRef(0); // For smooth transition to thinking

    // Color Palettes
    interface WaveLayer {
        color: string;
        opacity: number;
        freq: number;
        speed: number;
        amp: number;
        lineWidth?: number;
    }

    const THEMES: Record<string, WaveLayer[]> = {
        user: [
            { color: '#06b6d4', opacity: 0.5, freq: 0.012, speed: 0.015, amp: 35 }, // Cyan
            { color: '#22d3ee', opacity: 0.5, freq: 0.018, speed: 0.012, amp: 25 }, // Light Blue
            { color: '#10b981', opacity: 0.3, freq: 0.022, speed: 0.025, amp: 15 }, // Emerald
        ],
        agent: [
            { color: '#8b5cf6', opacity: 0.5, freq: 0.012, speed: 0.015, amp: 35 }, // Violet
            { color: '#d946ef', opacity: 0.5, freq: 0.018, speed: 0.012, amp: 25 }, // Fuchsia
            { color: '#f59e0b', opacity: 0.3, freq: 0.022, speed: 0.025, amp: 15 }, // Amber
        ],
        idle: [
            { color: '#64748b', opacity: 0.3, freq: 0.01, speed: 0.005, amp: 20 },
            { color: '#94a3b8', opacity: 0.3, freq: 0.015, speed: 0.008, amp: 15 }, // Was -0.01
            { color: '#cbd5e1', opacity: 0.2, freq: 0.02, speed: 0.01, amp: 10 },
        ]
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let phase = 0;

        // Resize Logic
        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 2;
                canvas.width = parent.offsetWidth * dpr;
                canvas.height = parent.offsetHeight * dpr;
                ctx.scale(dpr, dpr);
            }
        };

        resize();
        window.addEventListener('resize', resize);

        const draw = () => {
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const centerY = height / 2;

            ctx.clearRect(0, 0, width, height);

            // Handle States & Volume
            let vol = 0;
            if (isThinking) {
                // Smoothly ramp up a "simulated" pulse for thinking
                thinkingBuffer.current = Math.min(thinkingBuffer.current + 0.05, 1);
                vol = (Math.sin(phase * 0.5) * 0.2 + 0.3) * thinkingBuffer.current;
            } else if (isActive && getAudioData) {
                thinkingBuffer.current = 0;
                const data = getAudioData();
                if (data) {
                    const sum = data.slice(0, 40).reduce((a, b) => a + b, 0);
                    vol = (sum / (40 * 255)) * sensitivity;
                }
            }

            // Smoothing volume transition
            volumeRef.current = volumeRef.current * 0.8 + vol * 0.2;
            const activeVol = volumeRef.current;

            // Pick Palette
            // Fallback to idle if mode is undefined or invalid
            const currentTheme = THEMES[mode] || THEMES.idle;

            // Construct Layers
            const layers: WaveLayer[] = [
                ...currentTheme,
                {
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    opacity: 0.8, freq: 0.008, speed: 0.01, amp: 10, lineWidth: 2
                }
            ];

            ctx.globalCompositeOperation = isDarkMode ? 'screen' : 'multiply';

            layers.forEach((layer, i) => {
                ctx.beginPath();
                ctx.strokeStyle = layer.color;
                ctx.globalAlpha = layer.opacity;
                ctx.lineWidth = layer.lineWidth || 3;

                if (isActive || isThinking) {
                    ctx.shadowBlur = activeVol * 15;
                    ctx.shadowColor = layer.color;
                }

                for (let x = 0; x <= width; x += 2) {
                    const normX = x / width;
                    const taper = Math.pow(Math.sin(normX * Math.PI), 2);

                    let y;
                    if (isThinking) {
                        // THINKING MODE
                        const orbit = Math.sin(x * 0.02 + phase + i);
                        y = centerY + (orbit * 20 * activeVol * taper);
                    } else if (!isActive || mode === 'idle') {
                        // IDLE MODE: Standing Wave Ripple (No horizontal travel)
                        // It ripples up and down in place
                        const standing = Math.sin((x * layer.freq) + i); // Static shape
                        const ripple = Math.sin((phase * layer.speed * 4) + i); // Modulate amplitude

                        // Result: The wave sits in place but breathes/ripples
                        y = centerY + (standing * (layer.amp + (ripple * 5)) * taper);
                    } else {
                        // ACTIVE MODE: Pure Horizontal Flow
                        // Remove complex modulations that cause visual stutter
                        // Speed multiplier ensures it looks like it's traveling

                        const flowPhase = phase * layer.speed * 25; // 25x speed
                        const flowFn = Math.sin((x * layer.freq) + flowPhase + i);

                        const currentAmp = layer.amp + (activeVol * 50);
                        y = centerY + (flowFn * currentAmp * taper);
                    }

                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            ctx.globalAlpha = 1.0; // Reset alpha
            ctx.globalCompositeOperation = 'source-over'; // Reset blend mode

            phase += isThinking ? 0.05 : 0.2; // Faster global phase (was 0.1)
            animationId = requestAnimationFrame(draw);
        };

        draw();
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive, isThinking, getAudioData, isDarkMode, speed, sensitivity, mode]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
}