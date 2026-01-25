'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color, Vector2, ShaderMaterial } from 'three';

// --- CONFIGURATION ---
const THEME = {
    black: '#000000',     // The Void
    cyan: '#00ffff',      // User
    magenta: '#ff00aa',   // Agent
};

// --- THE HYPER-LIQUID SHADER ---
// This uses "Recursive Domain Warping" to create deep, folding liquid structures.
const fragmentShader = `
    uniform float uTime;
    uniform float uVolume;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec2 uResolution;

    varying vec2 vUv;

    // --- NOISE GENERATORS ---
    // Standard pseudo-random hash
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // Value Noise (Smooth random waves)
    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        // Cubic Hermite Interpolation
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(random(i + vec2(0.0, 0.0)), random(i + vec2(1.0, 0.0)), u.x),
                   mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    // FBM (Fractal Brownian Motion)
    // Stacks multiple layers of noise to create "Texture" and "Detail"
    #define OCTAVES 6
    float fbm(in vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 0.0;
        
        // Loop to add detail
        for (int i = 0; i < OCTAVES; i++) {
            value += amplitude * noise(st);
            st *= 2.0; // Double the frequency
            amplitude *= 0.5; // Halve the strength
        }
        return value;
    }

    // --- THE LIQUID MAGIC (Recursive Warping) ---
    void main() {
        vec2 uv = vUv;
        // Fix Aspect Ratio (keep circles circular)
        uv.x *= uResolution.x / uResolution.y;

        // Zoom out slightly to see the "Flow"
        vec2 st = uv * 3.0;

        // FLUID PHYSICS SIMULATION (Fake)
        // We distort the coordinate space (p) with noise (q), then distort THAT with noise (r).
        // This creates the "folding" look of real ink.
        
        vec2 q = vec2(0.);
        q.x = fbm(st + 0.1 * uTime);
        q.y = fbm(st + vec2(1.0));

        vec2 r = vec2(0.);
        r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * uTime);
        r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * uTime);

        // Calculate the final "Density" of the ink
        float f = fbm(st + r);

        // --- COLOR MIXING (High Contrast) ---
        
        // 1. Sharp Mixing: We use smoothstep to create defined "edges" between colors
        // instead of a muddy gray mix.
        float mixVal = f * f * 4.0; // Sharpen the noise curve
        mixVal = clamp(mixVal, 0.0, 1.0);
        
        vec3 color = mix(uColor1, uColor2, mixVal);

        // 2. The "Black Void" Mask
        // We want the ink to emerge from darkness. 
        // We create a mask based on the distortion (r) magnitude.
        float fluidMask = length(r) * f;
        fluidMask = smoothstep(0.1, 0.8, fluidMask); // Crunch contrast
        
        // 3. Audio Reactivity
        // When loud, the ink brightens and expands
        float brightness = 0.8 + (uVolume * 1.5);
        color *= brightness;
        
        // 4. "Wet" Highlights (Fake Specular)
        // We find the "ridges" in the noise and make them white
        float ridge = smoothstep(0.7, 0.8, f);
        color += vec3(1.0) * ridge * 0.3; // Add white gloss

        // Final Composition: Ink Color * Mask
        vec3 finalColor = color * fluidMask;
        
        // Vignette (Fade edges to black)
        float vignette = 1.0 - smoothstep(0.5, 1.5, length(vUv - 0.5));
        finalColor *= vignette;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

// --- SCENE COMPONENT ---
interface FluidProps {
    mode?: 'idle' | 'user' | 'agent';
    getAudioData?: () => Uint8Array | null;
}

function FluidScene({ getAudioData, mode = 'idle' }: FluidProps) {
    const meshRef = useRef<any>(null);

    // Uniforms (Memory Optimized)
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uVolume: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uColor1: { value: new Color(THEME.cyan) },
        uColor2: { value: new Color(THEME.magenta) },
    }), []);

    // Helper Colors
    const cCyan = useMemo(() => new Color(THEME.cyan), []);
    const cMagenta = useMemo(() => new Color(THEME.magenta), []);
    const cBlack = useMemo(() => new Color(THEME.black), []);
    const currentVol = useRef(0);

    useFrame((state) => {
        if (!meshRef.current) return;
        const mat = meshRef.current.material as ShaderMaterial;

        // 1. Audio Data Processing
        let targetVol = 0;
        if (getAudioData) {
            const data = getAudioData();
            if (data) {
                // Focus on low-mids (Body of the voice)
                const sub = data.slice(0, 50);
                const avg = sub.reduce((a, b) => a + b, 0) / sub.length;
                targetVol = avg / 128.0;
            }
        }
        // Smooth Volume (Fast attack, slow decay)
        currentVol.current += (targetVol - currentVol.current) * 0.1;

        // 2. Update Uniforms
        mat.uniforms.uTime.value = state.clock.getElapsedTime();
        mat.uniforms.uVolume.value = currentVol.current;
        mat.uniforms.uResolution.value.set(state.size.width, state.size.height);

        // 3. Smart Color Logic
        // Instead of swapping colors, we "Bias" the mix
        // uColor1 = Background Flow / uColor2 = Foreground Flow

        if (mode === 'user') {
            // User: Cyan Dominant, Magenta Highlights
            mat.uniforms.uColor1.value.lerp(cCyan, 0.05);
            mat.uniforms.uColor2.value.lerp(cBlack, 0.05); // Ink on dark
        } else if (mode === 'agent') {
            // Agent: Magenta Dominant, Cyan Highlights
            mat.uniforms.uColor1.value.lerp(cMagenta, 0.05);
            mat.uniforms.uColor2.value.lerp(cBlack, 0.05);
        } else {
            // Idle: Deep Blue/Black Void
            mat.uniforms.uColor1.value.lerp(new Color('#001133'), 0.02);
            mat.uniforms.uColor2.value.lerp(cBlack, 0.02);
        }

        // 4. Energy Injection
        // If volume spikes, flash the secondary color
        if (currentVol.current > 0.3) {
            if (mode === 'user') mat.uniforms.uColor2.value.lerp(cMagenta, 0.1);
            if (mode === 'agent') mat.uniforms.uColor2.value.lerp(cCyan, 0.1);
        }
    });

    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[2, 2]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
            />
        </mesh>
    );
}

// --- MAIN EXPORT ---
export default function FluidVisualizer(props: FluidProps) {
    return (
        <div className="w-full h-full bg-black rounded-xl overflow-hidden relative">
            <Canvas camera={{ position: [0, 0, 1] }} dpr={[1, 2]}>
                <FluidScene {...props} />
            </Canvas>
        </div>
    );
}