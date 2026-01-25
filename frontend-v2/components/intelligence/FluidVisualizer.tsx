'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color, AdditiveBlending, BufferGeometry, Points, CanvasTexture, PointsMaterial, BufferAttribute, LineSegments, LineBasicMaterial } from 'three';
import { createNoise3D } from 'simplex-noise';
import { OrbitControls } from '@react-three/drei';

// --- CONFIGURATION ---
const CONFIG = {
    nodeCount: 400,
    hazeCount: 1000,
    connectionDist: 6,
    baseSpeed: 0.1,
    // TOOL CONFIG
    toolNodeCount: 150,
    toolOffset: { x: 25, y: 8, z: 0 },
    colors: {
        bg: '#050510',
        nodeIdle: '#0044aa',
        nodeActive: '#00ffff',
        haze: '#550088',      // UPDATED: Brighter Purple for visibility
        synapse: '#ffffff',
        tool: '#ffaa00'       // Gold/Orange for Tools
    }
};

// --- TEXTURE GENERATORS ---
function createNodeTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
}

function createHazeTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // UPDATED: Boosted Opacity from 0.15 to 0.8 so it actually renders
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new CanvasTexture(canvas);
}

// --- MAIN SCENE ---
interface NeuralProps {
    mode?: 'idle' | 'user' | 'agent';
    getAudioData?: () => Uint8Array | null;
    isToolActive?: boolean; // NEW: Tool Support
}

function NetworkScene({ getAudioData, mode = 'idle', isToolActive = false }: NeuralProps) {
    const nodesRef = useRef<Points>(null);
    const toolNodesRef = useRef<Points>(null); // NEW: Tool Cluster
    const hazeRef = useRef<Points>(null);
    const linesRef = useRef<LineSegments>(null);
    const noise3D = useMemo(() => createNoise3D(), []);

    const [nodeTex, setNodeTex] = useState<CanvasTexture | null>(null);
    const [hazeTex, setHazeTex] = useState<CanvasTexture | null>(null);

    useEffect(() => {
        setNodeTex(createNodeTexture());
        setHazeTex(createHazeTexture());
    }, []);

    // --- INITIALIZE DATA ---
    const { brain, tools, haze, lineGeo } = useMemo(() => {
        // 1. Brain Nodes
        const bPos = new Float32Array(CONFIG.nodeCount * 3);
        const bBase = new Float32Array(CONFIG.nodeCount * 3);
        const bCol = new Float32Array(CONFIG.nodeCount * 3);

        const idleC = new Color(CONFIG.colors.nodeIdle);

        for (let i = 0; i < CONFIG.nodeCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 10 + Math.random() * 15;

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = (r * Math.sin(phi) * Math.sin(theta)) * 0.6;
            const z = r * Math.cos(phi);

            bPos[i * 3] = x; bPos[i * 3 + 1] = y; bPos[i * 3 + 2] = z;
            bBase[i * 3] = x; bBase[i * 3 + 1] = y; bBase[i * 3 + 2] = z;

            bCol[i * 3] = idleC.r; bCol[i * 3 + 1] = idleC.g; bCol[i * 3 + 2] = idleC.b;
        }

        // 2. Tool Nodes (Satellite Cluster)
        const tPos = new Float32Array(CONFIG.toolNodeCount * 3);
        const tBase = new Float32Array(CONFIG.toolNodeCount * 3);

        for (let i = 0; i < CONFIG.toolNodeCount; i++) {
            // Smaller, tighter cluster
            const r = Math.random() * 8;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = CONFIG.toolOffset.x + (r * Math.sin(phi) * Math.cos(theta));
            const y = CONFIG.toolOffset.y + (r * Math.sin(phi) * Math.sin(theta));
            const z = CONFIG.toolOffset.z + (r * Math.cos(phi));

            tPos[i * 3] = x; tPos[i * 3 + 1] = y; tPos[i * 3 + 2] = z;
            tBase[i * 3] = x; tBase[i * 3 + 1] = y; tBase[i * 3 + 2] = z;
        }

        // 3. Haze
        const hPos = new Float32Array(CONFIG.hazeCount * 3);
        for (let i = 0; i < CONFIG.hazeCount; i++) {
            const x = (Math.random() - 0.5) * 60;
            const y = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            hPos[i * 3] = x; hPos[i * 3 + 1] = y; hPos[i * 3 + 2] = z;
        }

        // 4. Lines (Brain Only for now)
        const maxLines = CONFIG.nodeCount * 4;
        const linePos = new Float32Array(maxLines * 6);

        return {
            brain: { pos: bPos, base: bBase, col: bCol },
            tools: { pos: tPos, base: tBase },
            haze: { pos: hPos },
            lineGeo: { pos: linePos }
        };
    }, []);

    const tempColor = useMemo(() => new Color(), []);
    const toolColor = useMemo(() => new Color(CONFIG.colors.tool), []);
    const currentVol = useRef(0);

    // --- LOOP ---
    useFrame((state) => {
        if (!nodesRef.current || !linesRef.current || !hazeRef.current || !toolNodesRef.current) return;
        const time = state.clock.getElapsedTime();

        // Audio Logic
        let vol = 0;
        if (getAudioData) {
            const data = getAudioData();
            if (data) {
                const sub = data.slice(20, 100);
                vol = sub.reduce((a, b) => a + b, 0) / sub.length / 255.0;
            }
        }
        currentVol.current += (vol - currentVol.current) * 0.1;
        const activity = currentVol.current;
        const expand = 1 + (activity * 0.2);

        // --- UPDATE BRAIN NODES ---
        const nPos = nodesRef.current.geometry.attributes.position.array as Float32Array;
        const nCol = nodesRef.current.geometry.attributes.color.array as Float32Array;

        for (let i = 0; i < CONFIG.nodeCount; i++) {
            const i3 = i * 3;
            // Base positions
            const bx = brain.base[i3];
            const by = brain.base[i3 + 1];
            const bz = brain.base[i3 + 2];

            const noiseScale = 0.05;
            const nX = noise3D(bx * noiseScale, by * noiseScale, time * 0.15);
            const nY = noise3D(bx * noiseScale + 100, by * noiseScale, time * 0.15);
            const nZ = noise3D(bx * noiseScale + 200, by * noiseScale, time * 0.15);

            // Active Tool Pull: When tools are active, brain leans slightly towards them
            let pullX = 0;
            if (isToolActive) pullX = 2.0;

            nPos[i3] = (bx * expand) + (nX * 4.0) + pullX;
            nPos[i3 + 1] = (by * expand) + (nY * 4.0);
            nPos[i3 + 2] = (bz * expand) + (nZ * 4.0);

            // Color Logic
            if (mode === 'user') tempColor.set(CONFIG.colors.nodeActive);
            else if (mode === 'agent') tempColor.set('#ff00aa');
            else tempColor.set(CONFIG.colors.nodeIdle);

            if (activity > 0.4 && Math.random() < 0.05) tempColor.set('#ffffff');

            nCol[i3] = tempColor.r;
            nCol[i3 + 1] = tempColor.g;
            nCol[i3 + 2] = tempColor.b;
        }
        nodesRef.current.geometry.attributes.position.needsUpdate = true;
        nodesRef.current.geometry.attributes.color.needsUpdate = true;

        // --- UPDATE TOOL NODES ---
        // They are always there but only visible/active when isToolActive
        toolNodesRef.current.visible = isToolActive;

        if (isToolActive) {
            const tPos = toolNodesRef.current.geometry.attributes.position.array as Float32Array;
            for (let i = 0; i < CONFIG.toolNodeCount; i++) {
                const i3 = i * 3;
                const bx = tools.base[i3];
                const by = tools.base[i3 + 1];
                const bz = tools.base[i3 + 2];

                // Fast spin/jitter for tools
                const nX = noise3D(bx * 0.2, by * 0.2, time * 2.0); // Fast noise
                const nY = noise3D(bx * 0.2 + 10, by * 0.2, time * 2.0);

                tPos[i3] = bx + nX;
                tPos[i3 + 1] = by + nY;
                tPos[i3 + 2] = bz;
            }
            toolNodesRef.current.geometry.attributes.position.needsUpdate = true;
        }

        // --- UPDATE HAZE ---
        const hPos = hazeRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < CONFIG.hazeCount; i++) {
            const i3 = i * 3;
            hPos[i3] += Math.sin(time * 0.05 + i) * 0.02;
            hPos[i3 + 1] += Math.cos(time * 0.06 + i) * 0.02;
            hPos[i3 + 2] += Math.sin(time * 0.04 + i) * 0.02;
        }
        hazeRef.current.geometry.attributes.position.needsUpdate = true;

        // --- UPDATE LINES ---
        const lPos = linesRef.current.geometry.attributes.position.array as Float32Array;
        let lineIdx = 0;
        const limit = lPos.length;
        const connectThreshold = CONFIG.connectionDist + (activity * 3);
        const thresholdSq = connectThreshold * connectThreshold;

        for (let i = 0; i < CONFIG.nodeCount; i++) {
            if (lineIdx >= limit) break;

            // Brain-to-Brain Connections
            for (let j = i + 1; j < Math.min(CONFIG.nodeCount, i + 12); j++) {
                const dx = nPos[i * 3] - nPos[j * 3];
                const dy = nPos[i * 3 + 1] - nPos[j * 3 + 1];
                const dz = nPos[i * 3 + 2] - nPos[j * 3 + 2];
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < thresholdSq) {
                    lPos[lineIdx++] = nPos[i * 3]; lPos[lineIdx++] = nPos[i * 3 + 1]; lPos[lineIdx++] = nPos[i * 3 + 2];
                    lPos[lineIdx++] = nPos[j * 3]; lPos[lineIdx++] = nPos[j * 3 + 1]; lPos[lineIdx++] = nPos[j * 3 + 2];
                }
            }
        }
        // TODO: Tool-to-Brain connections if close enough?

        for (let k = lineIdx; k < limit; k++) lPos[k] = 0;
        linesRef.current.geometry.attributes.position.needsUpdate = true;
        (linesRef.current.material as LineBasicMaterial).opacity = 0.1 + (activity * 0.5);
    });

    if (!nodeTex || !hazeTex) return null;

    return (
        <group>
            {/* LAYER 1: HAZE (FIXED ACCESSORS) */}
            <points ref={hazeRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={CONFIG.hazeCount}
                        args={[haze.pos, 3]} // FIXED: haze.pos, not nodes.haze.pos
                    />
                </bufferGeometry>
                <pointsMaterial
                    map={hazeTex}
                    size={45}
                    transparent
                    opacity={0.15}
                    color={CONFIG.colors.haze}
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </points>

            {/* LAYER 2: LINES (FIXED ACCESSORS) */}
            <lineSegments ref={linesRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={lineGeo.pos.length / 3}
                        args={[lineGeo.pos, 3]} // FIXED: lineGeo.pos
                    />
                </bufferGeometry>
                <lineBasicMaterial
                    color={CONFIG.colors.synapse}
                    transparent
                    opacity={0.2}
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </lineSegments>

            {/* LAYER 3: BRAIN NODES */}
            <points ref={nodesRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={CONFIG.nodeCount}
                        args={[brain.pos, 3]} // FIXED: nodes.pos
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        count={CONFIG.nodeCount}
                        args={[brain.col, 3]} // FIXED: nodes.col
                    />
                </bufferGeometry>
                <pointsMaterial
                    map={nodeTex}
                    vertexColors
                    size={1.5}
                    transparent
                    opacity={1.0}
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </points>

            {/* LAYER 4: TOOL NODES (Gold) */}
            <points ref={toolNodesRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={CONFIG.toolNodeCount} args={[tools.pos, 3]} />
                </bufferGeometry>
                <pointsMaterial map={nodeTex} color={CONFIG.colors.tool} size={2.5} transparent opacity={1.0} blending={AdditiveBlending} depthWrite={false} />
            </points>
        </group>
    );
}

// --- EXPORT ---
export default function NeuralNetworkVisualizer(props: NeuralProps) {
    return (
        <div className="w-full h-full bg-black rounded-xl overflow-hidden shadow-2xl relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0a0a15_0%,_#000000_100%)] z-0 pointer-events-none" />
            <Canvas camera={{ position: [0, 0, 45], fov: 60 }} dpr={[1, 2]}>
                <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
                <NetworkScene {...props} />
            </Canvas>
        </div>
    );
}