'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context/AppContext';

interface AntiGravityProps {
    isActive?: boolean;
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
    mode?: 'idle' | 'user' | 'agent' | 'dormant';
    isToolActive?: boolean; // New Prop
    isLiveView?: boolean;
    growth?: number; // 0.0 to 1.0
}

interface Particle {
    theta: number;
    phi: number;
    r: number;
    size: number;
    hueVariance: number;
    type: 0 | 1;
}

interface ProjectedParticle {
    x: number;
    y: number;
    z: number;
    p: Particle;
}

export default function AntiGravityVisualizer({
    isActive = true,
    getAudioData,
    mode = 'idle',
    speed = 1.0,
    sensitivity = 1.0,
    isToolActive = false,
    isLiveView = false,
    growth = 0
}: AntiGravityProps) {
    const { isDarkMode } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);

    // SMOOTHING VARS
    const currentVolume = useRef(0);
    const frameCount = useRef(0);
    const evolutionLevel = useRef(0); // Will sync to growth
    const toolOpacity = useRef(0); // Smooth transition for tool cluster
    const visualizerAlpha = useRef(1.0); // For dormant mode fade out

    // CONFIG - SCALED DOWN FOR HEADER BAR (h=100px)
    const PARTICLE_COUNT = 150;
    const TOOL_PARTICLE_COUNT = 40;
    const BASE_RADIUS = 28;       // Fits in 100px height (dia=56)
    const TOOL_RADIUS = 10;
    const TOOL_ORBIT_RADIUS = 60; // Closer orbit

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- 1. SETUP ---
        const initParticles = () => {
            particlesRef.current = [];

            // MAIN BRAIN (Type 0)
            const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
                const theta = GOLDEN_ANGLE * i;
                const phi = Math.acos(y);

                particlesRef.current.push({
                    theta: theta,
                    phi: phi,
                    r: BASE_RADIUS,
                    size: Math.random() * 1.5 + 0.5,
                    hueVariance: Math.random() * 20 - 10,
                    type: 0
                });
            }

            // TOOL CLUSTER (Type 1)
            for (let i = 0; i < TOOL_PARTICLE_COUNT; i++) {
                const y = 1 - (i / (TOOL_PARTICLE_COUNT - 1)) * 2;
                const theta = GOLDEN_ANGLE * i;
                const phi = Math.acos(y);

                particlesRef.current.push({
                    theta: theta,
                    phi: phi,
                    r: TOOL_RADIUS,
                    size: Math.random() * 1.5 + 0.5,
                    hueVariance: Math.random() * 10 - 5,
                    type: 1
                });
            }
        };

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

        window.addEventListener('resize', resize);
        resize();
        initParticles();

        // --- 2. ANIMATION LOOP ---
        let animationId: number;

        const render = () => {
            // A. AUDIO PROCESSING
            let rawVolume = 0;
            if (isActive && getAudioData) {
                const data = getAudioData();
                if (data) {
                    const sub = data.slice(10, 60);
                    const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                    if (avg > 30) {
                        rawVolume = (avg / 128.0) * sensitivity;
                    }

                    // EVOLVE: Driven by Context Growth Prop
                }
            }

            // Sync evolution to growth prop smoothly
            const targetGrowth = growth;
            evolutionLevel.current += (targetGrowth - evolutionLevel.current) * 0.05;

            /* (Replaced old audio-driven evolution) */

            currentVolume.current += (rawVolume - currentVolume.current) * 0.1;
            const vol = Math.max(0, currentVolume.current);

            // TOOL ANIMATION SMOOTHING
            const targetToolOpacity = isToolActive ? 1.0 : 0.0;
            toolOpacity.current += (targetToolOpacity - toolOpacity.current) * 0.05;

            // B. CANVAS CLEAR
            const w = canvas.width / (window.devicePixelRatio || 1);
            const h = canvas.height / (window.devicePixelRatio || 1);
            const cx = w / 2;
            const cy = h / 2;

            ctx.clearRect(0, 0, w, h);

            // Visibility / Mode Handling
            // If dormant, fade out significantly
            if (mode === 'dormant') {
                ctx.globalAlpha = 0.1;
            } else {
                ctx.globalAlpha = 1.0;
            }

            // C. PHYSICS
            const time = frameCount.current * 0.005 * speed;
            const breath = Math.sin(time) * 4;
            const baseRot = 0.001 * speed;
            const rotation = baseRot + (vol * 0.002);

            // Tool Orbit Physics
            const orbitSpeed = time * 2.0; // Faster orbit
            const toolOrbitX = Math.cos(orbitSpeed) * TOOL_ORBIT_RADIUS;
            const toolOrbitZ = Math.sin(orbitSpeed) * TOOL_ORBIT_RADIUS * 0.3; // Elliptical

            // D. COLORS (Mode Logic)
            let baseHue = 220;  // Idle (Blue)
            let activeHue = 180;// User (Cyan)

            if (mode === 'agent') {
                baseHue = 280;  // Purple
                activeHue = 320;// Pink
            } else if (mode === 'user') {
                baseHue = 200;  // Blue
                activeHue = 180;// Cyan
            }

            // Interpolate global hue based on volume
            const pVol = Math.max(0, Math.min(1, vol));
            const globalHue = baseHue + ((activeHue - baseHue) * pVol);

            // Tool Color (Orange/Amber)
            const toolHue = 30; // Amber

            // E. PROJECTION PHASE
            // We calculate all positions first so we can sort them
            const projected: ProjectedParticle[] = [];

            particlesRef.current.forEach((p) => {
                // Update Physics
                p.theta += rotation;
                p.phi += rotation * 0.5;
                let r = p.r + breath;

                // Tool Cluster: Spin faster on its own axis
                if (p.type === 1) {
                    p.theta += 0.02; // Spin faster
                    r = p.r + (Math.sin(time * 5) * 2); // Fast jitter pulse
                }

                // 3D -> 2D
                let x3d = r * Math.sin(p.phi) * Math.cos(p.theta);
                let y3d = r * Math.sin(p.phi) * Math.sin(p.theta);
                let z3d = r * Math.cos(p.phi);

                // Live View Stretch (Only stretch position, not particle shape)
                if (isLiveView) x3d *= 8.0;

                // Apply Cluster Offset
                if (p.type === 1) {
                    // Move to orbit position
                    x3d += toolOrbitX;
                    // y matches main sphere height mostly, maybe gentle bob
                    y3d += Math.sin(time * 3) * 20;
                    z3d += toolOrbitZ;
                }

                const focalLength = 400;
                // Standard Z-Sort: Positive Z is away from camera in this math,
                // so we want larger Z drawn first (behind), smaller Z drawn last (front).
                // Actually, standard perspective: scale = focal / (focal + z).
                // If z is positive, scale gets smaller (further away).
                const scale = focalLength / (focalLength + z3d);

                const x2d = cx + x3d * scale;
                const y2d = cy + y3d * scale;

                // Only add if not clipped behind camera
                if (z3d > -focalLength + 50) {
                    // Only add tool particles if they are visible
                    if (p.type === 0 || toolOpacity.current > 0.01) {
                        projected.push({ x: x2d, y: y2d, z: z3d, p });
                    }
                }
            });

            // G. DRAW LINES (Synapses)
            // Draw lines FIRST so they appear behind the dots
            // Faint lines that get stronger with evolution
            ctx.beginPath();
            const lineAlpha = (0.05 + (vol * 0.1)) * Math.min(1, evolutionLevel.current * 2);
            const lineLight = 40 + (vol * 40);
            ctx.strokeStyle = `hsla(${globalHue}, 80%, ${lineLight}%, ${lineAlpha})`;
            ctx.lineWidth = 0.5;

            // Optimization: Iterate through the original projected array
            // (which preserves the Fibonacci index order, keeping neighbors close)
            for (let i = 0; i < projected.length; i++) {
                // Skip tool particles for the main web (optional: connect them internally?)
                // Let's keep them separate for now -> Type 0 connects to Type 0
                if (projected[i].p.type !== 0) continue;

                // Check fewer neighbors for cleaner look (Was 12, now 6)
                for (let j = i + 1; j < Math.min(projected.length, i + 6); j++) {
                    if (projected[j].p.type !== 0) continue; // Only connect main to main

                    const p1 = projected[i];
                    const p2 = projected[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy;

                    // Dynamic connection distance based on EVOLUTION
                    // Starts at 0 (No lines), grows to 2000 (Dense web) over time
                    // Volume adds a momentary "stretch" to the connections
                    const baseThreshold = evolutionLevel.current * 1000;
                    if (baseThreshold < 50) continue; // Don't draw tiny jitter lines

                    const threshold = baseThreshold + (vol * 2000);

                    if (distSq < threshold) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                    }
                }
            }
            ctx.stroke();

            // TETHER LINES (Connect Tool to Main)
            // We want to show they are linked, not isolated.
            if (toolOpacity.current > 0.2) {
                ctx.beginPath();
                ctx.strokeStyle = `hsla(${toolHue}, 100%, 80%, ${toolOpacity.current * 0.2})`; // Faint tether
                ctx.lineWidth = 0.5;

                // Optimization: Iterate tool particles and find closest main particles
                // Since projected is sorted by Z, we can just grab a few valid ones
                // But full search is safer for visual quality given low particle count

                // Let's just do a targeted check
                const toolParticles = projected.filter(pt => pt.p.type === 1);
                const mainParticles = projected.filter(pt => pt.p.type === 0);

                // For every tool particle, try to connect to 1-2 main particles
                toolParticles.forEach(tp => {
                    let connections = 0;
                    for (const mp of mainParticles) {
                        if (connections >= 2) break; // Limit tethers per tool node

                        const dx = tp.x - mp.x;
                        const dy = tp.y - mp.y;
                        const distSq = dx * dx + dy * dy;

                        // Tethers need to reach further: ~100px gap (10000 sq)
                        // Dynamic reach based on audio
                        if (distSq < 15000 + (vol * 5000)) {
                            ctx.moveTo(tp.x, tp.y);
                            ctx.lineTo(mp.x, mp.y);
                            connections++;
                        }
                    }
                });
                ctx.stroke();
            }

            // TOOL LINES (Internal to Tool Cluster)
            if (toolOpacity.current > 0.1) {
                ctx.beginPath();
                ctx.strokeStyle = `hsla(${toolHue}, 100%, 70%, ${toolOpacity.current * 0.4})`;
                ctx.lineWidth = 0.8; // Thicker internal structure
                for (let i = 0; i < projected.length; i++) {
                    if (projected[i].p.type !== 1) continue;
                    for (let j = i + 1; j < projected.length; j++) {
                        if (projected[j].p.type !== 1) continue;
                        const dx = projected[i].x - projected[j].x;
                        const dy = projected[i].y - projected[j].y;
                        if ((dx * dx + dy * dy) < 1500) { // Slightly tighter than main
                            ctx.moveTo(projected[i].x, projected[i].y);
                            ctx.lineTo(projected[j].x, projected[j].y);
                        }
                    }
                }
                ctx.stroke();
            }

            // G. DRAW DOTS (Sorted)
            // Sort by Depth: Draw furthest (largest Z) first
            projected.sort((a, b) => b.z - a.z);

            projected.forEach((pt) => {
                const { x, y, z, p } = pt;
                // Recalculate scale here or store it? Storing is better but interface changed.
                // Re-calculating for simplicity as I removed scale from interface momentarily in my head
                // Wait, I updated ProjectedParticle above but need to populate it.
                // Let's add scale back to ProjectedParticle interface for optimization.
                // Actually I removed scale from interface in the Replace block... let me strictly follow the Interface I defined.
                // I defined: interface ProjectedParticle { x, y, z, p }  <-- NO SCALE
                // So I compute size here.

                const focalLength = 400;
                const scale = focalLength / (focalLength + z);

                const alpha = Math.max(0.1, (z + 200) / 400); // Simple fog

                // Add variety to color so it's not flat
                // Type 0 = Main, Type 1 = Tool
                let particleHue = globalHue + p.hueVariance;
                let opacity = alpha;
                let particleSize = p.size * scale;
                let lightness = 50 + (pVol * 40);

                if (p.type === 1) {
                    particleHue = toolHue + p.hueVariance;
                    opacity = alpha * toolOpacity.current; // Fade in/out
                    lightness = 70; // Bright amber
                    particleSize *= 1.2; // Slightly larger nodes
                }

                if (opacity < 0.01) return;

                ctx.beginPath();
                ctx.arc(x, y, particleSize, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${particleHue}, 90%, ${lightness}%, ${opacity})`;

                // Glow on loud volumes
                if ((pVol > 0.2 && p.type === 0) || (p.type === 1 && toolOpacity.current > 0.8)) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `hsla(${particleHue}, 100%, 70%, ${opacity})`;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fill();
                ctx.shadowBlur = 0; // Reset
            });

            frameCount.current++;
            animationId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive, getAudioData, isDarkMode, speed, sensitivity, mode, isToolActive]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
}