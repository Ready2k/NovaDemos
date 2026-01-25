'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface AntiGravityProps {
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
    speed?: number;       // Base speed multiplier
    sensitivity?: number; // Audio sensitivity multiplier
}

interface Particle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    radius: number;
    hue: number;
    life: number;
    offset: number;
}

export default function AntiGravityVisualizer({ isActive = true, getAudioData, speed = 1.0, sensitivity = 1.0 }: AntiGravityProps) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const energyRef = useRef(0);
    const frameRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // --- 1. INIT ---
        const initParticles = () => {
            const count = 150;
            const p: Particle[] = [];
            for (let i = 0; i < count; i++) {
                p.push(createParticle());
            }
            particlesRef.current = p;
        };

        const createParticle = (): Particle => {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const r = 40 + Math.random() * 100;

            return {
                x: r * Math.sin(phi) * Math.cos(theta),
                y: r * Math.sin(phi) * Math.sin(theta),
                z: r * Math.cos(phi),
                vx: 0,
                vy: 0,
                vz: 0,
                radius: Math.random() * 2 + 1,
                hue: 200 + Math.random() * 60,
                life: Math.random(),
                offset: Math.random() * 100
            };
        };

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = parent.offsetWidth * dpr;
                canvas.height = parent.offsetHeight * dpr;

                const ctx = canvas.getContext('2d');
                if (ctx) ctx.scale(dpr, dpr);

                canvas.style.width = `${parent.offsetWidth}px`;
                canvas.style.height = `${parent.offsetHeight}px`;
            }
        };

        resize();
        window.addEventListener('resize', resize);
        initParticles();

        // --- 2. RENDER LOOP ---
        const ctx = canvas.getContext('2d');
        let animationId: number;

        const render = () => {
            if (!ctx) return;
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const cx = width / 2;
            const cy = height / 2;

            // Audio Math
            let targetEnergy = 0;
            if (isActive && getAudioData) {
                const data = getAudioData();
                if (data) {
                    const sub = data.slice(5, 40);
                    const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                    targetEnergy = (avg / 128) * sensitivity; // Usage of sensitivity
                }
            }
            energyRef.current += (targetEnergy - energyRef.current) * 0.1;
            const energy = Math.max(0.01, energyRef.current);
            const isSpeaking = energy > 0.1;

            // Clearing
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = isDarkMode ? 'rgba(5, 8, 20, 0.2)' : 'rgba(240, 240, 255, 0.2)';
            ctx.fillRect(0, 0, width, height);

            ctx.globalCompositeOperation = isDarkMode ? 'lighter' : 'multiply';

            // Physics
            const focalLength = 400;
            const rotationSpeed = (isSpeaking ? 0.005 : 0.002) * speed; // Usage of speed

            particlesRef.current.forEach(p => {
                const cosRot = Math.cos(rotationSpeed);
                const sinRot = Math.sin(rotationSpeed);

                const x1 = p.x * cosRot - p.z * sinRot;
                const z1 = p.z * cosRot + p.x * sinRot;
                p.x = x1;
                p.z = z1;

                const time = frameRef.current * 0.01 * speed; // Usage of speed
                const floatY = Math.sin(time + p.offset) * 0.5 * speed;

                if (isSpeaking) {
                    const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
                    if (dist > 0.1) {
                        p.x += (p.x / dist) * energy * 4;
                        p.y += (p.y / dist) * energy * 4;
                        p.z += (p.z / dist) * energy * 4;
                    }
                } else {
                    p.y += floatY;
                }

                const maxDist = isSpeaking ? 400 : 250;
                const distSq = p.x * p.x + p.y * p.y + p.z * p.z;

                if (distSq > maxDist * maxDist) {
                    const scale = 0.95;
                    p.x *= scale; p.y *= scale; p.z *= scale;
                }

                if (p.z < -focalLength + 50) return;

                const scale = focalLength / (focalLength + p.z);
                if (scale > 20) return;

                const px = cx + p.x * scale;
                const py = cy + p.y * scale;
                const size = p.radius * scale * (1 + energy * 1.5);

                if (px < -50 || px > width + 50 || py < -50 || py > height + 50) return;

                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);

                let hue = p.hue;
                let saturation = '80%';
                let lightness = '60%';

                if (isSpeaking) {
                    hue = (p.hue + (energy * 50)) % 360;
                    saturation = '100%';
                    lightness = '70%';
                }

                ctx.fillStyle = `hsla(${hue}, ${saturation}, ${lightness}, ${p.life})`;

                if (isSpeaking && scale > 1) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = `hsla(${hue}, 100%, 50%, 0.8)`;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fill();
            });

            // Connections
            if (energy > 0.1) {
                ctx.lineWidth = 1;
                for (let i = 0; i < particlesRef.current.length; i += 4) {
                    const p1 = particlesRef.current[i];
                    if (p1.z < -300) continue;

                    for (let j = 1; j < 3; j++) {
                        const idx = (i + j) % particlesRef.current.length;
                        const p2 = particlesRef.current[idx];
                        if (p2.z < -300) continue;

                        const dx = p1.x - p2.x;
                        const dy = p1.y - p2.y;
                        const dz = p1.z - p2.z;
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        if (dist < 80) {
                            const scale1 = focalLength / (focalLength + p1.z);
                            const scale2 = focalLength / (focalLength + p2.z);

                            ctx.beginPath();
                            ctx.moveTo(cx + p1.x * scale1, cy + p1.y * scale1);
                            ctx.lineTo(cx + p2.x * scale2, cy + p2.y * scale2);

                            const alpha = (1 - dist / 80) * 0.4 * energy;
                            ctx.strokeStyle = `hsla(${p1.hue}, 80%, 70%, ${alpha})`;
                            ctx.stroke();
                        }
                    }
                }
            }

            frameRef.current++;
            animationId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive, getAudioData, isDarkMode, speed, sensitivity]); // Dep array

    return <canvas ref={canvasRef} className="w-full h-full" />;
}