'use client';

import { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
    isActive?: boolean;
}

export default function WaveformVisualizer({ isActive = true }: WaveformVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let phase = 0;

        const resize = () => {
            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        };

        resize();
        window.addEventListener('resize', resize);

        const draw = () => {
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const centerY = height / 2;

            ctx.clearRect(0, 0, width, height);

            // Draw multiple flowing waves with Siri-like gradients
            const waves = [
                { amplitude: 20, frequency: 0.02, speed: 0.03, color: 'rgba(6, 182, 212, 0.8)' }, // Cyan
                { amplitude: 25, frequency: 0.015, speed: 0.025, color: 'rgba(139, 92, 246, 0.6)' }, // Purple
                { amplitude: 15, frequency: 0.025, speed: 0.035, color: 'rgba(16, 185, 129, 0.5)' }, // Green
            ];

            waves.forEach((wave, index) => {
                ctx.beginPath();
                ctx.strokeStyle = wave.color;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';

                for (let x = 0; x < width; x++) {
                    const y = centerY + Math.sin((x * wave.frequency) + (phase * wave.speed) + index) * wave.amplitude * (isActive ? 1 : 0.3);
                    if (x === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.stroke();
            });

            phase += 0.05;
            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
}
