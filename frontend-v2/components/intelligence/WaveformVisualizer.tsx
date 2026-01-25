'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface WaveformVisualizerProps {
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
}

export default function WaveformVisualizer({ isActive = true, getAudioData, speed = 1.0, sensitivity = 1.0 }: WaveformVisualizerProps) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const volumeRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let phase = 0;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = parent.offsetWidth * dpr;
                canvas.height = parent.offsetHeight * dpr;
                ctx.scale(dpr, dpr);
                canvas.style.width = `${parent.offsetWidth}px`;
                canvas.style.height = `${parent.offsetHeight}px`;
            }
        };

        resize();
        window.addEventListener('resize', resize);

        const draw = () => {
            if (!canvas) return;
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const centerY = height / 2;

            ctx.clearRect(0, 0, width, height);

            // Calculate volume
            let currentVolume = 0;
            if (isActive && getAudioData) {
                const data = getAudioData();
                if (data) {
                    // Average first 32 bins (low frequencies)
                    const subArray = data.slice(0, 32);
                    const sum = subArray.reduce((acc, val) => acc + val, 0);
                    currentVolume = sum / (32 * 255);
                    currentVolume *= sensitivity; // Apply Sensitivity
                }
            }

            // Smooth volume
            volumeRef.current = volumeRef.current * 0.85 + currentVolume * 0.15;
            const vol = volumeRef.current;

            // Multipliers
            const baseAmp = isActive ? Math.max(0.1, vol) : 0.05;
            const speedMultiplier = (1 + (vol * 0.8)) * speed;
            const amplitudeMultiplier = 1 + (vol * 3);

            // Layer configuration
            const layers = [
                { color: 'rgba(6, 182, 212, 0.4)', freq: 0.012, speed: 0.015, amp: 20 },
                { color: 'rgba(139, 92, 246, 0.4)', freq: 0.015, speed: 0.02, amp: 15 },
                { color: 'rgba(16, 185, 129, 0.4)', freq: 0.02, speed: 0.025, amp: 10 },
                {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 15, 15, 0.9)',
                    freq: 0.008, speed: 0.015, amp: 8, lineWidth: 2.5
                }
            ];

            layers.forEach((layer, i) => {
                ctx.beginPath();
                ctx.strokeStyle = layer.color;
                ctx.lineWidth = (layer.lineWidth || 3) + (vol * 3);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                const layerAmp = layer.amp * amplitudeMultiplier;
                // Add gentle breathing when idle
                const breathing = Math.sin(phase * 0.5) * 5;
                const finalAmp = layerAmp + breathing;

                const layerFreq = layer.freq;
                const layerPhase = phase * layer.speed * speedMultiplier + (i * 2);

                const points = [];
                for (let x = -20; x < width + 20; x += 5) {
                    const normalizeX = x / width;
                    // Taper ends to 0
                    const taper = Math.sin(normalizeX * Math.PI);

                    const y = centerY +
                        Math.sin(x * layerFreq + layerPhase) * finalAmp * taper +
                        Math.sin(x * layerFreq * 2 + layerPhase * 1.3) * (finalAmp * 0.3) * taper;
                    points.push({ x, y });
                }

                if (points.length > 0) {
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let j = 1; j < points.length - 1; j++) {
                        const cp = points[j];
                        const next = points[j + 1];
                        const midX = (cp.x + next.x) / 2;
                        const midY = (cp.y + next.y) / 2;
                        ctx.quadraticCurveTo(cp.x, cp.y, midX, midY);
                    }
                }
                ctx.stroke();
            });

            phase += 0.02 * speed; // Slower phase scaling
            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive, getAudioData, isDarkMode, speed, sensitivity]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
}
