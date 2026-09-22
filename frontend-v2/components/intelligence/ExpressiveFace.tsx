'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type FaceMode = 'dormant' | 'idle' | 'listening' | 'thinking' | 'speaking';

type Viseme = 'rest' | 'closed' | 'open' | 'wide' | 'round' | 'teeth' | 'narrow' | 'tongue';

interface VisemeCue {
    shape: Viseme;
    duration: number;
}

interface ExpressiveFaceProps {
    mode: FaceMode;
    focused?: boolean;
    speechText?: string;
    speechKey?: string | number;
    sentiment?: number;
    getAudioData?: () => Uint8Array | null;
}

const CYAN = '#48e8e0';
const CYAN_MUTED = '#2a8a9b';
const VIOLET = '#9778ff';
const SILENCE_THRESHOLD = 0.018;

interface AudioFeatures {
    energy: number;
    centroid: number;
    lowRatio: number;
}

function analyseSpeech(bins: Uint8Array): AudioFeatures {
    const end = Math.min(bins.length, 64);
    let magnitude = 0;
    let weightedMagnitude = 0;
    let lowMagnitude = 0;

    // Skip the first two bins, which tend to contain DC/room rumble rather than
    // useful articulation information.
    for (let index = 2; index < end; index += 1) {
        const value = bins[index] / 255;
        magnitude += value;
        weightedMagnitude += value * index;
        if (index < 14) lowMagnitude += value;
    }

    return {
        energy: magnitude / Math.max(1, end - 2),
        centroid: magnitude > 0 ? weightedMagnitude / magnitude / end : 0,
        lowRatio: magnitude > 0 ? lowMagnitude / magnitude : 0,
    };
}

function audioFallbackViseme(features: AudioFeatures): Viseme {
    // When transcript cues arrive late, spectral shape still gives the mouth an
    // articulation that is visibly tied to the sound being heard.
    if (features.lowRatio > 0.5) return 'round';
    if (features.centroid > 0.5) return 'narrow';
    return features.energy > 0.13 ? 'open' : 'wide';
}

/**
 * Lightweight English grapheme-to-viseme conversion. It deliberately uses a
 * small visual vocabulary: the face reads naturally without pretending to be
 * frame-perfect facial capture. Audio energy controls timing/intensity; these
 * cues decide the actual mouth shape.
 */
function textToVisemes(text: string): VisemeCue[] {
    const cues: VisemeCue[] = [];
    const value = text.toLowerCase();
    let index = 0;

    const add = (shape: Viseme, duration = 92) => cues.push({ shape, duration });

    while (index < value.length) {
        const pair = value.slice(index, index + 2);
        const char = value[index];

        if (/\s/.test(char)) {
            add('rest', 45);
            index += 1;
            continue;
        }
        if (/[.,;:!?—-]/.test(char)) {
            add('rest', /[.!?]/.test(char) ? 180 : 110);
            index += 1;
            continue;
        }
        if (['th', 'll'].includes(pair)) {
            add('tongue', 105);
            index += 2;
            continue;
        }
        if (['sh', 'ch', 'ss', 'ck'].includes(pair)) {
            add('narrow', 105);
            index += 2;
            continue;
        }
        if (['oo', 'ou', 'ow', 'wh'].includes(pair)) {
            add('round', 125);
            index += 2;
            continue;
        }
        if (['ee', 'ea', 'ie'].includes(pair)) {
            add('wide', 120);
            index += 2;
            continue;
        }

        if (/[bmp]/.test(char)) add('closed', 90);
        else if (/[fv]/.test(char)) add('teeth', 105);
        else if (/[ouwq]/.test(char)) add('round', 115);
        else if (/[a]/.test(char)) add('open', 115);
        else if (/[eiy]/.test(char)) add('wide', 100);
        else if (/[lr]/.test(char)) add('tongue', 95);
        else if (/[sztdkgcjx]/.test(char)) add('narrow', 82);

        index += 1;
    }

    return cues;
}

function Mouth({ shape, intensity }: { shape: Viseme; intensity: number }) {
    const scale = 1 + intensity * 0.08;
    const common = {
        stroke: CYAN,
        strokeWidth: 3.5,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        fill: 'none',
        vectorEffect: 'non-scaling-stroke' as const,
    };

    return (
        <g transform={`translate(210 67) scale(${scale})`} style={{ transition: 'transform 70ms ease-out' }}>
            {shape === 'rest' && <path d="M-16 0 Q0 3 16 0" {...common} />}
            {shape === 'closed' && <path d="M-18 0 Q-7 -3 0 0 Q7 -3 18 0" {...common} />}
            {shape === 'open' && <ellipse cx="0" cy="1" rx="13" ry="12" {...common} />}
            {shape === 'wide' && <ellipse cx="0" cy="0" rx="20" ry="7" {...common} />}
            {shape === 'round' && <ellipse cx="0" cy="0" rx="8" ry="11" {...common} />}
            {shape === 'teeth' && (
                <>
                    <rect x="-17" y="-7" width="34" height="15" rx="7" {...common} />
                    <path d="M-13 -1 H13" stroke="#dffefe" strokeWidth="2" />
                </>
            )}
            {shape === 'narrow' && (
                <>
                    <path d="M-16 -2 Q0 -7 16 -2" {...common} />
                    <path d="M-16 3 Q0 8 16 3" {...common} />
                </>
            )}
            {shape === 'tongue' && (
                <>
                    <path d="M-17 -2 Q0 -7 17 -2 M-17 4 Q0 9 17 4" {...common} />
                    <path d="M0 3 V8" stroke={VIOLET} strokeWidth="3" strokeLinecap="round" />
                </>
            )}
        </g>
    );
}

export default function ExpressiveFace({ mode, focused = false, speechText = '', speechKey = '', sentiment = 0, getAudioData }: ExpressiveFaceProps) {
    const [viseme, setViseme] = useState<Viseme>('rest');
    const [intensity, setIntensity] = useState(0);
    const [isBlinking, setIsBlinking] = useState(false);
    const queueRef = useRef<VisemeCue[]>([]);
    const previousTextRef = useRef('');
    const previousSpeechKeyRef = useRef<string | number>('');
    const nextCueAtRef = useRef(0);
    const intensityRef = useRef(0);
    const lastAudibleAtRef = useRef(0);
    const previousEnergyRef = useRef(0);

    // Nova sends the accumulated streaming transcript. Queue only the new text.
    useEffect(() => {
        if (speechKey !== previousSpeechKeyRef.current) {
            queueRef.current = [];
            previousTextRef.current = '';
            previousSpeechKeyRef.current = speechKey;
        }
        const previous = previousTextRef.current;
        const delta = speechText.startsWith(previous) ? speechText.slice(previous.length) : speechText;
        if (!speechText || speechText.length < previous.length) {
            queueRef.current = [];
        }
        if (delta) {
            queueRef.current.push(...textToVisemes(delta));
        }
        previousTextRef.current = speechText;
    }, [speechKey, speechText]);

    // Natural, infrequent blink. Disabled while dormant because the closed eyes
    // already communicate that state.
    useEffect(() => {
        if (mode === 'dormant') return;
        let blinkTimer: ReturnType<typeof setTimeout>;
        let reopenTimer: ReturnType<typeof setTimeout>;
        const scheduleBlink = () => {
            blinkTimer = setTimeout(() => {
                setIsBlinking(true);
                reopenTimer = setTimeout(() => {
                    setIsBlinking(false);
                    scheduleBlink();
                }, 130);
            }, 2800 + Math.random() * 2400);
        };
        scheduleBlink();
        return () => {
            clearTimeout(blinkTimer);
            clearTimeout(reopenTimer);
        };
    }, [mode]);

    // Advance transcript-derived shapes only while assistant playback is active.
    useEffect(() => {
        if (mode !== 'speaking') {
            intensityRef.current = 0;
            nextCueAtRef.current = 0;
            lastAudibleAtRef.current = 0;
            previousEnergyRef.current = 0;
            setIntensity(0);
            setViseme('rest');
            return;
        }

        let animationFrame = 0;
        let lastEnergyUpdate = 0;
        const tick = (now: number) => {
            if (now - lastEnergyUpdate > 45) {
                const bins = getAudioData?.();
                if (bins?.length) {
                    const features = analyseSpeech(bins);
                    const targetIntensity = Math.min(1, Math.max(0, features.energy - SILENCE_THRESHOLD) * 5.2);
                    const smoothing = targetIntensity > intensityRef.current ? 0.68 : 0.28;
                    const nextIntensity = intensityRef.current + (targetIntensity - intensityRef.current) * smoothing;
                    const audible = features.energy > SILENCE_THRESHOLD || nextIntensity > 0.045;
                    const onset = features.energy - previousEnergyRef.current > 0.035;

                    intensityRef.current = nextIntensity;
                    previousEnergyRef.current = features.energy;
                    setIntensity(current => Math.abs(nextIntensity - current) > 0.015 ? nextIntensity : current);

                    if (audible) {
                        lastAudibleAtRef.current = now;
                        if (now >= nextCueAtRef.current || onset) {
                            const cue = queueRef.current.shift();
                            setViseme(cue?.shape ?? audioFallbackViseme(features));
                            // Strong speech articulates faster. The onset shortcut
                            // lets plosives visibly land without racing in silence.
                            const baseDuration = cue?.duration ?? 92;
                            nextCueAtRef.current = now + Math.max(58, baseDuration * (1.12 - nextIntensity * 0.28));
                        }
                    } else if (now - lastAudibleAtRef.current > 65) {
                        // Close promptly on real pauses and at the end of playback;
                        // importantly, do not consume transcript cues while quiet.
                        setViseme('rest');
                        nextCueAtRef.current = now;
                    }
                }
                lastEnergyUpdate = now;
            }
            animationFrame = requestAnimationFrame(tick);
        };
        animationFrame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrame);
    }, [mode, getAudioData]);

    const isQuestion = speechText.trimEnd().endsWith('?');
    const positive = sentiment > 0.2 || /\b(great|good|absolutely|perfect|excellent|happy)\b/i.test(speechText);
    const thinking = mode === 'thinking';
    const sleeping = mode === 'dormant';
    const blink = isBlinking || sleeping;

    const gaze = useMemo(() => {
        if (thinking) return { x: 3.5, y: -2.5 };
        if (mode === 'listening') return { x: 0, y: 0 };
        return { x: 0, y: 0.5 };
    }, [mode, thinking]);

    const label = mode === 'dormant' ? 'Nova face dormant' : `Nova face ${mode}`;

    return (
        <svg
            viewBox={focused ? '110 0 200 100' : '0 0 420 100'}
            className="h-full w-full"
            role="img"
            aria-label={label}
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                <filter id="faceGlow" x="-60%" y="-80%" width="220%" height="260%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <radialGradient id="faceAmbient">
                    <stop offset="0" stopColor={CYAN} stopOpacity="0.12" />
                    <stop offset="1" stopColor={CYAN} stopOpacity="0" />
                </radialGradient>
            </defs>

            <ellipse cx="210" cy="50" rx="91" ry="49" fill="url(#faceAmbient)" />
            <ellipse cx="210" cy="50" rx="56" ry="43" fill="rgba(9,42,55,0.45)" stroke={CYAN_MUTED} strokeWidth="1.2" />

            {mode === 'listening' && (
                <g fill="none" strokeLinecap="round" className="animate-pulse" filter="url(#faceGlow)">
                    <path d="M145 31 Q133 50 145 69" stroke={CYAN} strokeWidth="3" />
                    <path d="M136 24 Q118 50 136 76" stroke={CYAN_MUTED} strokeWidth="2" />
                    <path d="M275 31 Q287 50 275 69" stroke={CYAN} strokeWidth="3" />
                    <path d="M284 24 Q302 50 284 76" stroke={CYAN_MUTED} strokeWidth="2" />
                </g>
            )}

            <g filter="url(#faceGlow)" fill="none" strokeLinecap="round">
                <path
                    d={thinking ? 'M172 29 Q187 22 199 28' : `M172 ${isQuestion ? 24 : 28 - intensity * 1.5} Q187 ${isQuestion ? 20 : 23 - intensity * 2.5} 199 ${isQuestion ? 25 : 28 - intensity * 1.5}`}
                    stroke={thinking ? VIOLET : CYAN_MUTED}
                    strokeWidth="2.5"
                    style={{ transition: 'd 180ms ease' }}
                />
                <path
                    d={thinking ? 'M221 25 Q235 19 248 22' : `M221 ${isQuestion ? 25 : 28 - intensity * 1.5} Q235 ${isQuestion ? 20 : 23 - intensity * 2.5} 248 ${isQuestion ? 24 : 28 - intensity * 1.5}`}
                    stroke={thinking ? VIOLET : CYAN_MUTED}
                    strokeWidth="2.5"
                    style={{ transition: 'd 180ms ease' }}
                />
            </g>

            <g filter="url(#faceGlow)" style={{ transition: 'transform 160ms ease' }}>
                {blink ? (
                    <>
                        <path d="M174 43 Q187 47 200 43" fill="none" stroke={CYAN} strokeWidth="3.5" strokeLinecap="round" />
                        <path d="M220 43 Q233 47 246 43" fill="none" stroke={CYAN} strokeWidth="3.5" strokeLinecap="round" />
                    </>
                ) : (
                    <>
                        <ellipse cx="187" cy="43" rx="15" ry="9" fill="none" stroke={CYAN} strokeWidth="3.5" />
                        <ellipse cx="233" cy="43" rx="15" ry="9" fill="none" stroke={CYAN} strokeWidth="3.5" />
                        <circle cx={187 + gaze.x} cy={43 + gaze.y} r="3.2" fill="#e9ffff" />
                        <circle cx={233 + gaze.x} cy={43 + gaze.y} r="3.2" fill="#e9ffff" />
                    </>
                )}
            </g>

            <g filter="url(#faceGlow)">
                <Mouth
                    shape={mode === 'speaking' ? viseme : positive && mode === 'idle' ? 'wide' : 'rest'}
                    intensity={mode === 'speaking' ? intensity : 0}
                />
            </g>

            {thinking && (
                <g fill={VIOLET} className="animate-pulse">
                    <circle cx="200" cy="84" r="2" />
                    <circle cx="210" cy="84" r="2" />
                    <circle cx="220" cy="84" r="2" />
                </g>
            )}
        </svg>
    );
}
