'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, Object3D, InstancedMesh, Vector3 } from 'three';
import { createNoise3D } from 'simplex-noise';
import { OrbitControls } from '@react-three/drei';

// --- CONFIGURATION ---
const CONFIG = {
    particleCount: 8000,
    baseSpeed: 0.2,
    flowScale: 0.8,
    radius: 50,
    colors: {
        idle: '#0a0a20',      // Deep Space Blue
        user: '#00ffff',      // Cyan
        agent: '#ff00aa'      // Magenta
    }
};

// --- SCENE COMPONENT ---
interface VortexSceneProps {
    mode?: 'idle' | 'user' | 'agent';
    getAudioData?: () => Uint8Array | null;
    speed?: number;
    sensitivity?: number;
}

function VortexScene({ getAudioData, mode = 'idle', speed = 1.0, sensitivity = 1.0 }: VortexSceneProps) {
    const meshRef = useRef<InstancedMesh>(null);
    const { camera, mouse, size } = useThree();
    const noise3D = useMemo(() => createNoise3D(), []);

    // --- PARTICLE STATE ---
    // We store raw data in Float32Arrays for speed (no GC)
    const particles = useMemo(() => {
        const count = CONFIG.particleCount;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const life = new Float32Array(count); // 0 to 1
        const maxLife = new Float32Array(count); // Random max life

        for (let i = 0; i < count; i++) {
            // Spawn inside a sphere
            const r = Math.cbrt(Math.random()) * CONFIG.radius;
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            life[i] = Math.random();
            maxLife[i] = 0.5 + Math.random() * 0.5;
        }

        return { positions, velocities, life, maxLife };
    }, []);

    // Helper Objects (reused)
    const dummy = useMemo(() => new Object3D(), []);
    const color = useMemo(() => new Color(), []);
    const targetColor = useMemo(() => new Color(), []);
    const currentAudioVol = useRef(0);

    // Color Targets
    const C_IDLE = useMemo(() => new Color(CONFIG.colors.idle), []);
    const C_USER = useMemo(() => new Color(CONFIG.colors.user), []);
    const C_AGENT = useMemo(() => new Color(CONFIG.colors.agent), []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const time = state.clock.getElapsedTime();

        // --- AUDIO ANALYSIS ---
        let vol = 0;
        if (getAudioData) {
            const data = getAudioData();
            if (data) {
                // Check varied frequencies for a full spectrum feel
                const sub = data.slice(5, 50);
                const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                vol = avg / 128.0;
            }
        }
        // Smooth
        currentAudioVol.current += (vol - currentAudioVol.current) * 0.1;
        const audioEnergy = currentAudioVol.current * sensitivity;

        // Determine Base Color
        if (mode === 'user') targetColor.copy(C_USER);
        else if (mode === 'agent') targetColor.copy(C_AGENT);
        else targetColor.copy(C_IDLE);

        // --- UPDATE PARTICLES ---
        let i3 = 0;
        const { positions, velocities, life, maxLife } = particles;
        const count = CONFIG.particleCount;

        // Tuning
        const timeScale = (CONFIG.baseSpeed + (audioEnergy * 0.5)) * speed;
        const noiseScale = CONFIG.flowScale;
        const turbulence = 0.5 + (audioEnergy * 2.0); // More chaos when loud

        // Mouse interaction (project mouse to 3D roughly)
        // const mouseVec = new Vector3((mouse.x * size.width) / 2, (mouse.y * size.height) / 2, 0);

        for (let i = 0; i < count; i++) {
            i3 = i * 3;

            // Get Position
            let x = positions[i3];
            let y = positions[i3 + 1];
            let z = positions[i3 + 2];

            // 1. Calculate Flow Vector (Simplex Noise)
            // We use 4D noise trick (3D pos + time) for evolving fields
            const nX = noise3D(x * 0.02, y * 0.02, z * 0.02 + time * 0.1);
            const nY = noise3D(x * 0.02, y * 0.02 + 100, z * 0.02 + time * 0.1);
            const nZ = noise3D(x * 0.02, y * 0.02 + 200, z * 0.02 + time * 0.1);

            // 2. Apply Velocity
            velocities[i3] += nX * 0.01 * turbulence;
            velocities[i3 + 1] += nY * 0.01 * turbulence;
            velocities[i3 + 2] += nZ * 0.01 * turbulence;

            // Damping (Drag)
            velocities[i3] *= 0.95;
            velocities[i3 + 1] *= 0.95;
            velocities[i3 + 2] *= 0.95;

            // Move
            x += velocities[i3] * timeScale * 60 * delta; // Normalize to 60fps
            y += velocities[i3 + 1] * timeScale * 60 * delta;
            z += velocities[i3 + 2] * timeScale * 60 * delta;

            // 3. Central Gravity / Containment
            // Pull back to center if too far
            const distSq = x * x + y * y + z * z;
            if (distSq > CONFIG.radius * CONFIG.radius) {
                const force = -0.005;
                velocities[i3] += x * force;
                velocities[i3 + 1] += y * force;
                velocities[i3 + 2] += z * force;
            }

            // 4. Update Arrays
            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            // 5. Update Instance Matrix
            dummy.position.set(x, y, z);

            // Scale based on audio + life
            // Audio Bass Punch: expands particles
            const lifeFactor = Math.sin(life[i] * Math.PI); // Grow then shrink
            const audioScale = 1 + (audioEnergy * 2);
            const s = 0.15 * lifeFactor * audioScale;
            dummy.scale.set(s, s, s);

            // Rotation (align with velocity approx or just random spin)
            dummy.rotation.set(nZ, nY, nX);

            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            // 6. Update Color (Bioluminescence)
            // Higher energy = brighter / whiter mix
            // We mix the Target Color with White based on velocity/energy
            const velocityMag = Math.abs(nX) + Math.abs(nY) + Math.abs(nZ);

            color.copy(targetColor);
            // Add brightness based on individual particle turbulence
            color.offsetHSL(0, 0, velocityMag * 0.2 + (audioEnergy * 0.5));

            // Fade out at life edges
            // We can't easily change opacity per instance in Standard Mesh, 
            // but we can scale size to 0 (done above) or darken color.
            meshRef.current.setColorAt(i, color);

            // 7. Life Cycle
            life[i] += delta * 0.2 * speed;
            if (life[i] > 1) {
                life[i] = 0;
                // Respawn near center?
                // positions[i3] = (Math.random()-0.5)*10;
                // positions[i3+1] = (Math.random()-0.5)*10;
                // positions[i3+2] = (Math.random()-0.5)*10;
            }
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, CONFIG.particleCount]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
}

// --- MAIN WRAPPER ---
export default function ParticleVortexVisualizer(props: any) {
    return (
        <div className="w-full h-full bg-black rounded-xl overflow-hidden shadow-3xl">
            <Canvas camera={{ position: [0, 0, 70], fov: 45 }} dpr={[1, 2]}>
                <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
                <VortexScene {...props} />
            </Canvas>
        </div>
    );
}
