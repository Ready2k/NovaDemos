'use client';

import { useRef, useCallback, useState } from 'react';

interface UseAudioProcessorOptions {
    onAudioData?: (data: ArrayBuffer) => void;
    inputSampleRate?: number;
    outputSampleRate?: number;
    bufferSize?: number;
}

interface UseAudioProcessorReturn {
    isRecording: boolean;
    isMuted: boolean;
    initialize: () => Promise<void>;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    playAudio: (audioData: ArrayBuffer) => Promise<void>;
    clearQueue: () => void;
    setMuted: (muted: boolean) => void;
    getAudioData: () => Uint8Array | null;
    cleanup: () => void;
}

export function useAudioProcessor(options: UseAudioProcessorOptions = {}): UseAudioProcessorReturn {
    const {
        onAudioData,
        inputSampleRate = 16000,
        outputSampleRate = 24000,
        bufferSize = 2048,
    } = options;

    const [isRecording, setIsRecording] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const isRecordingRef = useRef(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const playbackNodesRef = useRef<AudioBufferSourceNode[]>([]);
    const nextStartTimeRef = useRef(0);

    // Initialize audio context and microphone
    const initialize = useCallback(async () => {
        if (audioContextRef.current) return;

        try {
            // Create audio context
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            console.log(`[AudioProcessor] AudioContext created with sample rate: ${audioContextRef.current.sampleRate}Hz`);

            // Create analyser
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            analyserRef.current.smoothingTimeConstant = 0.5;
            const bufferLength = analyserRef.current.frequencyBinCount;
            dataArrayRef.current = new Uint8Array(bufferLength);

            // Request microphone access
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: inputSampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            console.log('[AudioProcessor] Microphone access granted');
        } catch (error) {
            console.error('[AudioProcessor] Failed to initialize:', error);
            throw new Error('Microphone access denied or unavailable');
        }
    }, [inputSampleRate]);

    // Downsample audio to target sample rate
    const downsample = useCallback((buffer: Float32Array, fromRate: number, toRate: number): Float32Array => {
        if (fromRate === toRate) return buffer;

        const compression = fromRate / toRate;
        const length = Math.floor(buffer.length / compression);
        const result = new Float32Array(length);

        for (let i = 0; i < length; i++) {
            const pos = i * compression;
            const index = Math.floor(pos);
            const decimal = pos - index;

            if (index + 1 < buffer.length) {
                result[i] = buffer[index] * (1 - decimal) + buffer[index + 1] * decimal;
            } else {
                result[i] = buffer[index];
            }
        }

        return result;
    }, []);

    // Convert Float32Array to PCM16 (Int16Array)
    const convertToPCM16 = useCallback((float32Array: Float32Array): Int16Array => {
        const pcm16 = new Int16Array(float32Array.length);

        for (let i = 0; i < float32Array.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        return pcm16;
    }, []);

    // Convert PCM16 (Int16Array) to Float32Array
    const convertToFloat32 = useCallback((int16Array: Int16Array): Float32Array => {
        const float32 = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            float32[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }

        return float32;
    }, []);

    // Start recording
    const startRecording = useCallback(async () => {
        if (isRecording) {
            console.warn('[AudioProcessor] Already recording');
            return;
        }

        if (!audioContextRef.current || !mediaStreamRef.current) {
            await initialize();
        }

        const audioContext = audioContextRef.current!;
        const mediaStream = mediaStreamRef.current!;

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        setIsRecording(true);
        isRecordingRef.current = true;
        nextStartTimeRef.current = audioContext.currentTime;

        // Create source node from microphone stream
        sourceNodeRef.current = audioContext.createMediaStreamSource(mediaStream);

        // Connect to analyser for visualization
        if (analyserRef.current) {
            sourceNodeRef.current.connect(analyserRef.current);
        }

        // Create script processor for audio processing
        processorNodeRef.current = audioContext.createScriptProcessor(
            bufferSize,
            1, // mono input
            1  // mono output
        );

        let processCount = 0;
        processorNodeRef.current.onaudioprocess = (event) => {
            if (!isRecordingRef.current) return;

            processCount++;
            if (processCount === 1) {
                console.log('[AudioProcessor] FIRST audio chunk processed. Context State:', audioContext.state);
            }
            if (processCount % 50 === 0) {
                console.log('[AudioProcessor] Processing audio chunk', processCount);
            }

            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            // Downsample to target input rate
            const downsampledData = downsample(inputData, audioContext.sampleRate, inputSampleRate);

            // Convert to PCM16
            const pcm16Data = convertToPCM16(downsampledData);

            // Send to callback (WebSocket)
            if (onAudioData) {
                onAudioData(pcm16Data.buffer as ArrayBuffer);
            }
        };

        // Connect nodes
        sourceNodeRef.current.connect(processorNodeRef.current);
        processorNodeRef.current.connect(audioContext.destination);

        console.log('[AudioProcessor] Recording started');
    }, [isRecording, initialize, bufferSize, inputSampleRate, downsample, convertToPCM16, onAudioData]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (!isRecordingRef.current) return;

        setIsRecording(false);
        isRecordingRef.current = false;

        // Disconnect and clean up nodes
        if (processorNodeRef.current) {
            processorNodeRef.current.disconnect();
            processorNodeRef.current = null;
        }

        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }

        console.log('[AudioProcessor] Recording stopped');
    }, [isRecording]);

    // Play received audio data
    const playAudio = useCallback(async (audioData: ArrayBuffer) => {
        if (isMuted) {
            console.warn('[AudioProcessor] Skipping playback: muted');
            return;
        }

        if (!audioContextRef.current) {
            await initialize();
        }

        const audioContext = audioContextRef.current!;

        // Ensure context is running (it might be suspended by browser policy)
        if (audioContext.state !== 'running') {
            try {
                console.log(`[AudioProcessor] Resuming AudioContext (current state: ${audioContext.state})...`);
                await audioContext.resume();
                console.log('[AudioProcessor] AudioContext state after resume:', audioContext.state);
            } catch (err) {
                console.error('[AudioProcessor] Failed to resume AudioContext:', err);
            }
        }

        try {
            // Ensure even byte length for Int16Array (16-bit PCM = 2 bytes per sample)
            let buffer = audioData;
            if (audioData.byteLength % 2 !== 0) {
                console.warn(`[AudioProcessor] Padding odd-sized audio data: ${audioData.byteLength} -> ${audioData.byteLength + 1} bytes`);
                const padded = new Uint8Array(audioData.byteLength + 1);
                padded.set(new Uint8Array(audioData));
                padded[audioData.byteLength] = 0; // Pad with zero
                buffer = padded.buffer;
            }

            // Convert ArrayBuffer to Int16Array (PCM16)
            const pcm16Data = new Int16Array(buffer);

            // Convert PCM16 to Float32Array
            const float32Data = convertToFloat32(pcm16Data);

            // Create audio buffer (Nova outputs at 24kHz)
            const audioBuffer = audioContext.createBuffer(
                1, // mono
                float32Data.length,
                outputSampleRate
            );

            // Copy data to audio buffer
            audioBuffer.getChannelData(0).set(float32Data);

            // Create buffer source node
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;

            // Connect to destination (speakers)
            sourceNode.connect(audioContext.destination);

            // Connect to analyser for visualization
            if (analyserRef.current) {
                sourceNode.connect(analyserRef.current);
            }

            // Schedule playback
            const startTime = Math.max(audioContext.currentTime, nextStartTimeRef.current);
            const delay = startTime - audioContext.currentTime;

            console.log(`[AudioProcessor] PLAYBACK_STATUS: Buffer=${audioBuffer.length} samples, Time=${audioBuffer.duration.toFixed(3)}s, StartIn=${delay.toFixed(3)}s`);

            sourceNode.start(startTime);

            // Update next start time
            nextStartTimeRef.current = startTime + audioBuffer.duration;

            // Clean up after playback
            sourceNode.onended = () => {
                sourceNode.disconnect();
            };

            playbackNodesRef.current.push(sourceNode);
        } catch (error) {
            console.error('[AudioProcessor] PLAYBACK_ERROR:', error);
        }
    }, [isMuted, initialize, outputSampleRate, convertToFloat32]);

    // Clear audio queue
    const clearQueue = useCallback(() => {
        // Stop all currently playing nodes
        playbackNodesRef.current.forEach(node => {
            try {
                node.stop();
                node.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
        });
        playbackNodesRef.current = [];

        // Reset playback time to now
        if (audioContextRef.current) {
            nextStartTimeRef.current = audioContextRef.current.currentTime;
        }

        console.log('[AudioProcessor] Audio queue cleared');
    }, []);

    const getAudioData = useCallback((): Uint8Array | null => {
        if (!analyserRef.current || !dataArrayRef.current) {
            return null;
        }
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
        return dataArrayRef.current;
    }, []);

    // Cleanup resources
    const cleanup = useCallback(() => {
        stopRecording();
        clearQueue();

        // Stop media stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        console.log('[AudioProcessor] Resources cleaned up');
    }, [stopRecording, clearQueue]);

    return {
        isRecording,
        isMuted,
        initialize,
        startRecording,
        stopRecording,
        playAudio,
        clearQueue,
        setMuted: setIsMuted,
        getAudioData,
        cleanup,
    };
}
