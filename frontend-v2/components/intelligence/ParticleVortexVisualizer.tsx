'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, Object3D, InstancedMesh, Vector3, LineSegments, BufferGeometry, Float32BufferAttribute } from 'three';
import { createNoise3D } from 'simplex-noise';
import { OrbitControls } from '@react-three/drei';

// --- CONFIGURATION ---
const CONFIG = {
    // MAIN BRAIN
    particleCount: 4000,   // Background Dust
    starCount: 150,        // Foreground Stars (Connectable)

    // TOOL CLUSTER (ID&V)
    toolParticleCount: 1500,
    toolStarCount: 60,
    toolOffset: new Vector3(50, 12, 0), // Position of the tool cluster relative to center

    connectionTemp: 25,    // Max distance to connect
    baseSpeed: 0.15,
    flowScale: 0.8,
    radius: 45,
    colors: {
        idle: '#0a0a20',      // Deep Space Blue
        user: '#00ffff',      // Cyan
        agent: '#ff00aa',     // Magenta
        tool: '#ff8800'       // Orange (Tool Active)
    }
};

interface VortexSceneProps {
    mode?: 'idle' | 'user' | 'agent' | 'dormant';
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
    growth?: number;        // 0.0 to 1.0 (Conversation Progress)
    isToolActive?: boolean; // Is the tool cluster visible/active?
    isLiveView?: boolean;
}

function HybridVortexScene({ getAudioData, mode = 'idle', speed = 1.0, sensitivity = 1.0, growth = 1.0, isToolActive = false, isLiveView = false }: VortexSceneProps) {
    const mainMeshRef = useRef<InstancedMesh>(null);
    const toolMeshRef = useRef<InstancedMesh>(null);
    const linesRef = useRef<LineSegments>(null);
    const { camera, size } = useThree();
    const noise3D = useMemo(() => createNoise3D(), []);

    // --- PARTICLE STATE ---
    const particles = useMemo(() => {
        // Total = Main (Dust+Stars) + Tool (Dust+Stars)
        const mainTotal = CONFIG.particleCount + CONFIG.starCount;
        const toolTotal = CONFIG.toolParticleCount + CONFIG.toolStarCount;
        const total = mainTotal + toolTotal;

        const positions = new Float32Array(total * 3);
        const velocities = new Float32Array(total * 3);
        const life = new Float32Array(total);
        const types = new Uint8Array(total); // 0=MainDust, 1=MainStar, 2=ToolDust, 3=ToolStar

        // Helper to spawn 
        const spawn = (i: number, centerX: number, centerY: number, centerZ: number, rMax: number) => {
            const r = Math.cbrt(Math.random()) * rMax;
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = centerX + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = centerY + r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = centerZ + r * Math.cos(phi);
            life[i] = Math.random();
        };

        // 1. Initialize Main Brain (0 to mainTotal)
        for (let i = 0; i < mainTotal; i++) {
            const isStar = i < CONFIG.starCount;
            types[i] = isStar ? 1 : 0;
            spawn(i, 0, 0, 0, CONFIG.radius);
        }

        // 2. Initialize Tool Cluster (mainTotal to total)
        for (let j = 0; j < toolTotal; j++) {
            const i = mainTotal + j;
            const isStar = j < CONFIG.toolStarCount;
            types[i] = isStar ? 3 : 2;
            spawn(i, CONFIG.toolOffset.x, CONFIG.toolOffset.y, CONFIG.toolOffset.z, 20); // Smaller radius for tool
        }

        return { positions, velocities, life, types, count: total, mainTotal, toolTotal };
    }, []);

    // Line Geometry State
    const lineGeo = useMemo(() => {
        const geo = new BufferGeometry();
        // Max possible lines = stars * (stars-1) / 2. We cap it for performance.
        // Allow enough buffer for both clusters
        const maxLines = (CONFIG.starCount + CONFIG.toolStarCount) * 10;
        const pos = new Float32Array(maxLines * 6); // 2 points per line * 3 coords
        geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
        return geo;
    }, []);

    // Helpers
    const dummy = useMemo(() => new Object3D(), []);
    const color = useMemo(() => new Color(), []);
    const targetColor = useMemo(() => new Color(), []);
    const toolColor = useMemo(() => new Color(CONFIG.colors.tool), []);
    const currentAudioVol = useRef(0);

    // Targets
    const C_IDLE = useMemo(() => new Color(CONFIG.colors.idle), []);
    const C_USER = useMemo(() => new Color(CONFIG.colors.user), []);
    const C_AGENT = useMemo(() => new Color(CONFIG.colors.agent), []);

    useFrame((state, delta) => {
        if (!mainMeshRef.current || !toolMeshRef.current) return;

        const time = state.clock.getElapsedTime();

        // --- AUDIO ANALYSIS ---
        let vol = 0;
        if (getAudioData) {
            const data = getAudioData();
            if (data) {
                const sub = data.slice(5, 50);
                const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                vol = avg / 128.0;
            }
        }
        currentAudioVol.current += (vol - currentAudioVol.current) * 0.1;
        const audioEnergy = currentAudioVol.current * sensitivity;

        // Base Color
        if (mode === 'user') targetColor.copy(C_USER);
        else if (mode === 'agent') targetColor.copy(C_AGENT);
        else targetColor.copy(C_IDLE);

        // --- MANAGE VISIBILITY (Growth / Dormant) ---
        // Main Mesh: Set count based on growth.
        // START SMALL: 1% at growth=0.0
        let visibleMainCount = Math.floor(particles.mainTotal * Math.max(0.01, growth));

        if (mode === 'dormant') {
            visibleMainCount = 0; // Hide everything
        }

        mainMeshRef.current.count = visibleMainCount;

        // Tool Mesh: Toggle visibility
        toolMeshRef.current.visible = isToolActive;

        // Helper to Clamp Delta (prevents explosion on tab switch)
        const dt = Math.min(delta, 0.1);

        // --- UPDATE PARTICLES ---
        const { positions, velocities, life, types, count, mainTotal } = particles;
        const timeScale = (CONFIG.baseSpeed + (audioEnergy * 0.6)) * speed;
        // Tool spins faster when active
        const toolTimeScale = timeScale * (isToolActive ? 2.0 : 0.5);
        const turbulence = 0.5 + (audioEnergy * 2.0);

        for (let i = 0; i < count; i++) {
            const type = types[i];
            const isTool = type >= 2;
            const isStar = type === 1 || type === 3;

            // Skip physics for inactive tool particles optimization
            if (isTool && !isToolActive) continue;
            // Skip physics for hidden main particles optimization
            if (!isTool && i >= visibleMainCount) continue;

            const i3 = i * 3;
            let x = positions[i3];
            let y = positions[i3 + 1];
            let z = positions[i3 + 2];

            // --- PHYSICS ---
            const mySpeed = isTool ? toolTimeScale : timeScale;

            // 1. Noise Flow
            const nX = noise3D(x * 0.02, y * 0.02, z * 0.02 + time * 0.15);
            const nY = noise3D(x * 0.02, y * 0.02 + 100, z * 0.02 + time * 0.15);
            const nZ = noise3D(x * 0.02, y * 0.02 + 200, z * 0.02 + time * 0.15);

            velocities[i3] += nX * 0.008 * turbulence;
            velocities[i3 + 1] += nY * 0.008 * turbulence;
            velocities[i3 + 2] += nZ * 0.008 * turbulence;

            // 2. Vortex Spin (Keeps them expanded)
            let cx = 0, cz = 0;
            if (isTool) {
                cx = CONFIG.toolOffset.x;
                cz = CONFIG.toolOffset.z;
            }
            // Angle around the cluster center
            const ax = x - cx;
            const az = z - cz;
            const angle = Math.atan2(az, ax);
            const dist = Math.sqrt(ax * ax + az * az);

            // Spin force stronger near center to fling them out, weaker at edges
            const spinForce = (0.05 + (10 / (dist + 1))) * 0.002 * turbulence;

            velocities[i3] += Math.sin(angle) * spinForce; // Tangent X
            velocities[i3 + 2] -= Math.cos(angle) * spinForce; // Tangent Z

            // 3. Gravity (Containment + Orbit)
            let cy = 0, cr = CONFIG.radius;
            const pullStrength = 0.01;

            if (isTool) {
                cy = CONFIG.toolOffset.y;
                cr = 20;
            }

            const dx = x - cx;
            const dy = y - cy;
            const dz = z - cz;
            const distSq = dx * dx + dy * dy + dz * dz;

            // Soft Containment (Pull back if too far)
            if (distSq > cr * cr) {
                const force = -0.01;
                velocities[i3] += dx * force * pullStrength;
                velocities[i3 + 1] += dy * force * pullStrength;
                velocities[i3 + 2] += dz * force * pullStrength;
            }

            // Star specific behavior (Gentle centering vs collapsing)
            if (isStar) {
                velocities[i3 + 1] += Math.sin(time + x * 0.1) * 0.001;
            }

            // Drag
            const drag = isTool ? 0.94 : 0.96; // Tools are slightly "looser" or "tighter"
            velocities[i3] *= drag;
            velocities[i3 + 1] *= drag;
            velocities[i3 + 2] *= drag;

            // Update Position
            x += velocities[i3] * mySpeed * 60 * dt;
            y += velocities[i3 + 1] * mySpeed * 60 * dt;
            z += velocities[i3 + 2] * mySpeed * 60 * dt;

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            // --- RENDER ---
            dummy.position.set(x, y, z);

            const baseSize = isStar ? 0.35 : 0.12;
            const pulse = isStar ? 1 + (audioEnergy * 0.5) : 1;

            dummy.scale.setScalar(baseSize * pulse);
            dummy.updateMatrix();

            // Store in appropriate mesh
            if (isTool) {
                // Tool particle indices start at mainTotal in the global array
                // But in the ToolMesh, they start at 0.
                const toolIndex = i - mainTotal;
                toolMeshRef.current.setMatrixAt(toolIndex, dummy.matrix);

                color.copy(toolColor);
                if (Math.random() > 0.90) color.offsetHSL(0, 0, 0.5);
                toolMeshRef.current.setColorAt(toolIndex, color);

            } else {
                // Main particle
                mainMeshRef.current.setMatrixAt(i, dummy.matrix);

                color.copy(targetColor);
                if (isStar) color.offsetHSL(0, 0, 0.3);
                else color.offsetHSL(0, 0, -0.1);
                mainMeshRef.current.setColorAt(i, color);
            }
        }

        mainMeshRef.current.instanceMatrix.needsUpdate = true;
        if (mainMeshRef.current.instanceColor) mainMeshRef.current.instanceColor.needsUpdate = true;

        if (isToolActive) {
            toolMeshRef.current.instanceMatrix.needsUpdate = true;
            if (toolMeshRef.current.instanceColor) toolMeshRef.current.instanceColor.needsUpdate = true;
        }


        // --- UPDATE LINES (Constellation) ---
        // Only checking stars (first N particles)
        if (linesRef.current) {
            const linePos = linesRef.current.geometry.attributes.position.array as Float32Array;
            let lineIdx = 0;

            // DYNAMIC CONNECTION DISTANCE (Brain Density)
            // Starts small (15) and grows to (35) as context grows.
            const baseConn = 15 + (growth * 25);
            const connectDist = baseConn * (1 + audioEnergy * 0.5);
            const connectDistSq = connectDist * connectDist;

            // 1. Connect Main Stars
            // Scale visible stars by growth
            // Stars are the FIRST indices in the array (0 to starCount).
            // We need to check if they are within the visible count.

            // Check: CONFIG.starCount is ~150. Total main is 4150. 
            // Growth cuts from the end. So Stars are always visible unless growth is near 0.
            // visibleMainCount = 4150 * growth.
            // If visibleMainCount < starCount, we only process that many.

            const mainPctForStars = Math.max(0.2, growth); // Always show at least 20% of stars potential
            const actualVisibleStars = Math.floor(CONFIG.starCount * mainPctForStars);

            for (let i = 0; i < actualVisibleStars; i++) {
                const i3 = i * 3;
                const p1x = positions[i3];
                const p1y = positions[i3 + 1];
                const p1z = positions[i3 + 2];

                // Check neighbors
                // Optimization: Don't check all. Check next 10? Or just subset. 
                // For 150 stars, O(N^2) = 22,500 checks. Totally fine for JS.
                for (let j = i + 1; j < actualVisibleStars; j++) {
                    const j3 = j * 3;
                    const dx = p1x - positions[j3];
                    const dy = p1y - positions[j3 + 1];
                    const dz = p1z - positions[j3 + 2];

                    const d2 = dx * dx + dy * dy + dz * dz;

                    if (d2 < connectDistSq) {
                        // Add Line
                        linePos[lineIdx++] = p1x;
                        linePos[lineIdx++] = p1y;
                        linePos[lineIdx++] = p1z;

                        linePos[lineIdx++] = positions[j3];
                        linePos[lineIdx++] = positions[j3 + 1];
                        linePos[lineIdx++] = positions[j3 + 2];

                        if (lineIdx >= linePos.length) break;
                    }
                }
                if (lineIdx >= linePos.length) break;
            }

            // 2. Connect Tool Stars (If Active)
            if (isToolActive) {
                // Tool stars: indices from mainTotal to mainTotal + toolStarCount
                const toolStart = mainTotal;
                const toolEnd = mainTotal + CONFIG.toolStarCount;

                for (let i = toolStart; i < toolEnd; i++) {
                    const i3 = i * 3;
                    const p1x = positions[i3];
                    const p1y = positions[i3 + 1];
                    const p1z = positions[i3 + 2];

                    for (let j = i + 1; j < toolEnd; j++) {
                        const j3 = j * 3;
                        const d2 = (p1x - positions[j3]) ** 2 + (p1y - positions[j3 + 1]) ** 2 + (p1z - positions[j3 + 2]) ** 2;

                        if (d2 < connectDistSq) {
                            linePos[lineIdx++] = p1x; linePos[lineIdx++] = p1y; linePos[lineIdx++] = p1z;
                            linePos[lineIdx++] = positions[j3]; linePos[lineIdx++] = positions[j3 + 1]; linePos[lineIdx++] = positions[j3 + 2];
                            if (lineIdx >= linePos.length) break;
                        }
                    }
                    if (lineIdx >= linePos.length) break;
                }
            }

            // Zero out remaining lines (fold into 0,0,0) to hide them
            for (let k = lineIdx; k < linePos.length; k++) {
                linePos[k] = 0;
            }

            linesRef.current.geometry.attributes.position.needsUpdate = true;
            // Dynamic Line Opacity? (BufferGeometry doesn't support varying opacity easily without shader)
            // We'll rely on global material transparency/color

            // Pulse line color
            const lineMat = linesRef.current.material as any;
            lineMat.color.lerp(targetColor, 0.1);
            lineMat.opacity = 0.2 + (audioEnergy * 0.4);
        }

    });

    return (
        <group scale={[isLiveView ? 5 : 1, 1, 1]}>
            {/* MAIN CLUSTER (Deep Space Blue) */}
            <instancedMesh ref={mainMeshRef} args={[undefined, undefined, CONFIG.particleCount + CONFIG.starCount]}>
                <sphereGeometry args={[1, 6, 6]} /> {/* Low poly spheres */}
                <meshBasicMaterial toneMapped={false} />
            </instancedMesh>

            {/* TOOL CLUSTER (Orange/Gold) */}
            <instancedMesh ref={toolMeshRef} args={[undefined, undefined, CONFIG.toolParticleCount + CONFIG.toolStarCount]}>
                <sphereGeometry args={[1, 6, 6]} />
                <meshBasicMaterial toneMapped={false} />
            </instancedMesh>

            {/* LINES (Constellations) */}
            <lineSegments ref={linesRef} geometry={lineGeo}>
                <lineBasicMaterial
                    color={CONFIG.colors.idle}
                    transparent
                    opacity={0.3}
                    depthWrite={false} // Additive-like feel
                    blending={2} // AdditiveBlending = 2
                />
            </lineSegments>
        </group>
    );
}

// --- MAIN WRAPPER ---
export default function HybridConstellationVisualizer(props: any) {
    return (
        <div className="w-full h-full overflow-hidden">
            <Canvas camera={{ position: [0, 0, 90], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true }}>
                <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.3} />
                <HybridVortexScene {...props} />
            </Canvas>
        </div>
    );
}
