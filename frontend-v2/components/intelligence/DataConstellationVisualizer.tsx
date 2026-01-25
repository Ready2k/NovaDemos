'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface FlatConstellationProps {
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
}

interface Point {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

export default function FlatConstellation({ isActive = true, getAudioData, speed = 1.0, sensitivity = 1.0 }: FlatConstellationProps) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nodesRef = useRef<Point[]>([]);
    const energyRef = useRef(0);
    const animationRef = useRef<number>(0);

    // Color Configuration
    const THEME = {
        idle: isDarkMode ? { r: 0, g: 140, b: 255 } : { r: 0, g: 100, b: 220 }, // Cyan/Blue
        active: { r: 180, g: 50, b: 250 } // Purple/Neon
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // --- 1. SETUP ---
        const initNodes = () => {
            const width = canvas.width;
            const height = canvas.height;
            const nodeCount = 60; // Clean number for 2D

            nodesRef.current = Array.from({ length: nodeCount }).map(() => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5, // Slow base drift
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1.5
            }));
        };

        const handleResize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = parent.offsetWidth * dpr;
                canvas.height = parent.offsetHeight * dpr;

                const ctx = canvas.getContext('2d');
                if (ctx) ctx.scale(dpr, dpr);

                canvas.style.width = `${parent.offsetWidth}px`;
                canvas.style.height = `${parent.offsetHeight}px`;

                initNodes();
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        // --- 2. RENDER LOOP ---
        const ctx = canvas.getContext('2d');

        const render = () => {
            if (!ctx) return;
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;

            // -- Audio Analysis --
            let targetEnergy = 0;
            if (isActive && getAudioData) {
                const data = getAudioData();
                if (data) {
                    // Mid-range frequencies
                    const subArr = data.slice(5, 40);
                    const avg = subArr.reduce((a, b) => a + b, 0) / subArr.length;
                    targetEnergy = (avg / 128.0) * sensitivity; // Apply Sensitivity
                }
            }
            // Smooth smoothing
            energyRef.current += (targetEnergy - energyRef.current) * 0.15;
            const energy = Math.max(0, energyRef.current);
            const isSpeaking = energy > 0.1;

            // -- Clear Canvas --
            ctx.clearRect(0, 0, width, height);

            // -- Settings --
            const currentSpeed = (isSpeaking ? 1.0 : 0.3) * speed;
            const connectDist = 120 + (energy * 100);

            // Color Interpolation
            const mix = (c1: number, c2: number, w: number) => Math.round(c1 + (c2 - c1) * w);
            const weight = Math.min(1, energy * 2);

            const r = mix(THEME.idle.r, THEME.active.r, weight);
            const g = mix(THEME.idle.g, THEME.active.g, weight);
            const b = mix(THEME.idle.b, THEME.active.b, weight);
            const rgb = `${r},${g},${b}`;

            // -- Update & Draw Nodes --
            nodesRef.current.forEach((node, i) => {
                // Physics
                node.x += node.vx * currentSpeed;
                node.y += node.vy * currentSpeed;

                // Wall Bounce
                if (node.x <= 0 || node.x >= width) node.vx *= -1;
                if (node.y <= 0 || node.y >= height) node.vy *= -1;

                // Speaking Explosion (Gentle push from center)
                if (isSpeaking && energy > 0.2) {
                    const dx = node.x - width / 2;
                    const dy = node.y - height / 2;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 200) {
                        node.x += (dx / dist) * energy;
                        node.y += (dy / dist) * energy;
                    }
                }

                // Draw Node
                ctx.beginPath();
                const size = node.radius + (energy * 4);
                ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${0.6 + energy * 0.4})`;

                // Subtle Glow (Active only)
                if (isSpeaking) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `rgba(${rgb}, 0.5)`;
                } else {
                    ctx.shadowBlur = 0;
                }
                ctx.fill();

                // Draw Connections
                // Iterate forward to avoid duplicates
                for (let j = i + 1; j < nodesRef.current.length; j++) {
                    const other = nodesRef.current[j];
                    const dx = node.x - other.x;
                    const dy = node.y - other.y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < connectDist) {
                        ctx.beginPath();
                        const opacity = (1 - dist / connectDist) * (0.3 + energy * 0.5);
                        ctx.strokeStyle = `rgba(${rgb}, ${opacity})`;
                        ctx.lineWidth = isSpeaking ? 1.5 : 0.8;
                        ctx.moveTo(node.x, node.y);
                        ctx.lineTo(other.x, other.y);
                        ctx.stroke();
                    }
                }
            });

            // Reset Shadow for next frame efficiency
            ctx.shadowBlur = 0;

            animationRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationRef.current);
        };
    }, [isActive, getAudioData, isDarkMode, speed, sensitivity]);

    return <canvas ref={canvasRef} className="block w-full h-full" />;
}