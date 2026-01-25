'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface DataConstellationV2Props {
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
}

interface Point2D {
    x: number;
    y: number;
    vx: number;
    vy: number;
    baseRadius: number;
    phase: number;
}

export default function DataConstellationV2Visualizer({ isActive = true, getAudioData, speed = 1.0, sensitivity = 1.0 }: DataConstellationV2Props) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const energyRef = useRef(0);
    const nodesRef = useRef<Point2D[]>([]);
    const frameRef = useRef(0);

    // Color Setup (Bioluminescent look)
    const COLOR_PRIMARY = { r: 50, g: 120, b: 255 };
    const COLOR_SECONDARY = { r: 120, g: 50, b: 255 };
    const COLOR_BURST = { r: 255, g: 200, b: 50 };
    // unused: const COLOR_AMBER = { r: 255, g: 140, b: 20 };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // --- Init ---
        const initNodes = () => {
            const count = 80;
            const nodes: Point2D[] = [];
            for (let i = 0; i < count; i++) {
                nodes.push({
                    x: (Math.random() - 0.5) * 600,
                    y: (Math.random() - 0.5) * 300,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: (Math.random() - 0.5) * 0.2,
                    baseRadius: Math.random() * 2 + 1,
                    phase: Math.random() * Math.PI * 2
                });
            }
            nodesRef.current = nodes;
        };

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = parent.offsetWidth * dpr;
                canvas.height = parent.offsetHeight * dpr;
                canvas.style.width = `${parent.offsetWidth}px`;
                canvas.style.height = `${parent.offsetHeight}px`;

                const ctx = canvas.getContext('2d');
                if (ctx) ctx.scale(dpr, dpr);
            }
        };

        resize();
        window.addEventListener('resize', resize);
        initNodes();

        // --- Loop ---
        const ctx = canvas.getContext('2d');
        let mId: number;

        const render = () => {
            if (!ctx) return;
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const cx = width / 2;
            const cy = height / 2;

            // Audio
            let targetEnergy = 0;
            if (isActive && getAudioData) {
                const data = getAudioData();
                if (data) {
                    const sub = data.slice(5, 40);
                    const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                    targetEnergy = (avg / 120) * sensitivity;
                }
            }
            energyRef.current += (targetEnergy - energyRef.current) * 0.15;
            const energy = Math.max(0, energyRef.current);
            const isActiveSpeaking = energy > 0.1;

            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';

            const speedMult = (isActiveSpeaking ? 0.8 : 0.2) * speed;
            const maxConnectDist = 120 + (energy * 100);

            // Update 
            for (let i = 0; i < nodesRef.current.length; i++) {
                const n = nodesRef.current[i];
                n.x += n.vx * speedMult;
                n.y += n.vy * speedMult;
                n.phase += (0.05 + (energy * 0.1)) * speed;

                if (isActiveSpeaking) {
                    n.x += (Math.random() - 0.5) * energy * 4;
                    n.y += (Math.random() - 0.5) * energy * 4;
                } else {
                    n.x += Math.sin(frameRef.current * 0.01 + n.phase) * 0.2 * speed;
                    n.y += Math.cos(frameRef.current * 0.01 + n.phase) * 0.2 * speed;
                }

                const boundaryX = width * 0.6;
                const boundaryY = height * 0.6;

                if (n.x > boundaryX) n.vx -= 0.01;
                if (n.x < -boundaryX) n.vx += 0.01;
                if (n.y > boundaryY) n.vy -= 0.01;
                if (n.y < -boundaryY) n.vy += 0.01;

                n.vx *= 0.99;
                n.vy *= 0.99;
            }

            // Draw Connections
            const nodes = nodesRef.current;
            for (let i = 0; i < nodes.length; i++) {
                const n1 = nodes[i];
                const px1 = cx + n1.x;
                const py1 = cy + n1.y;

                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = nodes[j];
                    const px2 = cx + n2.x;
                    const py2 = cy + n2.y;

                    const dx = px1 - px2;
                    const dy = py1 - py2;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < maxConnectDist) {
                        const alpha = (1 - dist / maxConnectDist) * (0.2 + energy * 0.4);

                        ctx.beginPath();
                        ctx.moveTo(px1, py1);
                        ctx.lineTo(px2, py2);

                        let r = COLOR_PRIMARY.r;
                        let g = COLOR_PRIMARY.g;
                        let b = COLOR_PRIMARY.b;

                        if (isActiveSpeaking && energy > 0.5) {
                            const t = Math.min(1, (energy - 0.5));
                            r += (COLOR_BURST.r - r) * t;
                            g += (COLOR_BURST.g - g) * t;
                            b += (COLOR_BURST.b - b) * t;
                        }

                        ctx.strokeStyle = `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, ${alpha})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        if (isActiveSpeaking && Math.random() > 0.98) {
                            ctx.save();
                            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha + 0.6})`;
                            ctx.lineWidth = 2.5;
                            ctx.shadowColor = 'white';
                            ctx.shadowBlur = 10;
                            ctx.stroke();
                            ctx.restore();
                        }
                    }
                }
            }

            // Draw Nodes
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const px = cx + n.x;
                const py = cy + n.y;

                const size = n.baseRadius * (1 + energy * 1.5 + Math.sin(n.phase) * 0.2);
                const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 3);

                let r = COLOR_PRIMARY.r;
                let g = COLOR_PRIMARY.g;
                let b = COLOR_PRIMARY.b;

                if (isActiveSpeaking && energy > 0.2) {
                    const t = Math.min(1, energy);
                    r = COLOR_PRIMARY.r + (COLOR_BURST.r - COLOR_PRIMARY.r) * t;
                    g = COLOR_PRIMARY.g + (COLOR_BURST.g - COLOR_PRIMARY.g) * t;
                    b = COLOR_PRIMARY.b + (COLOR_BURST.b - COLOR_PRIMARY.b) * t;
                } else {
                    const t = (Math.sin(frameRef.current * 0.02 + i) + 1) / 2;
                    r = COLOR_PRIMARY.r + (COLOR_SECONDARY.r - COLOR_PRIMARY.r) * t;
                    g = COLOR_PRIMARY.g + (COLOR_SECONDARY.g - COLOR_PRIMARY.g) * t;
                    b = COLOR_PRIMARY.b + (COLOR_SECONDARY.b - COLOR_PRIMARY.b) * t;
                }

                grad.addColorStop(0, `rgba(255, 255, 255, 0.9)`);
                grad.addColorStop(0.3, `rgba(${r},${g},${b}, 0.6)`);
                grad.addColorStop(1, `rgba(${r},${g},${b}, 0)`);

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(px, py, size * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            frameRef.current++;
            mId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(mId);
        };
    }, [isActive, getAudioData, isDarkMode, speed, sensitivity]);

    return <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none' }} />;
}
