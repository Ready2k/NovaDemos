/**
 * Audio Processing Module
 * 
 * Handles:
 * - Microphone capture via getUserMedia
 * - PCM16 conversion
 * - Real-time streaming
 * - Audio playback
 */

class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.playbackNodes = [];
        this.isRecording = false;
        this.onAudioData = null; // Callback for audio data
        this.nextStartTime = 0; // Track when the next audio chunk should play

        // Audio configuration
        this.SAMPLE_RATE = 16000;
        this.CHANNELS = 1; // Mono
        this.BUFFER_SIZE = 2048; // Lower latency (was 4096)

        // Visualizer
        this.analyser = null;
        this.dataArray = null;
    }

    /**
     * Initialize audio context and request microphone access
     */
    async initialize() {
        try {
            // Create audio context (let browser choose sample rate)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[AudioProcessor] AudioContext created with sample rate: ${this.audioContext.sampleRate}Hz`);

            // Create analyzer
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256; // 128 bins
            this.analyser.smoothingTimeConstant = 0.5;
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: this.CHANNELS,
                    sampleRate: this.SAMPLE_RATE,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            console.log('Microphone access granted');
            return true;
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            throw new Error('Microphone access denied or unavailable');
        }
    }

    /**
     * Start recording and streaming audio
     */
    async startRecording(onAudioData) {
        if (this.isRecording) {
            console.warn('Already recording');
            return;
        }

        if (!this.audioContext || !this.mediaStream) {
            await this.initialize();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.onAudioData = onAudioData;
        this.isRecording = true;
        this.nextStartTime = this.audioContext.currentTime; // Reset playback time

        // Create source node from microphone stream
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        // Connect to analyzer for visualization
        if (this.analyser) {
            this.sourceNode.connect(this.analyser);
        }

        // Create script processor for audio processing
        // Note: ScriptProcessorNode is deprecated but widely supported
        // For production, consider using AudioWorklet
        this.processorNode = this.audioContext.createScriptProcessor(
            this.BUFFER_SIZE,
            this.CHANNELS,
            this.CHANNELS
        );

        // Process audio data
        let processCount = 0;
        this.processorNode.onaudioprocess = (event) => {
            if (!this.isRecording) return;

            processCount++;
            if (processCount % 50 === 0) {
                console.log('[AudioProcessor] Processing audio chunk', processCount);
            }

            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0); // Get mono channel

            // Downsample to 16kHz
            const downsampledData = this.downsample(inputData, this.audioContext.sampleRate, this.SAMPLE_RATE);

            // Convert Float32Array to PCM16 (Int16Array)
            const pcm16Data = this.convertToPCM16(downsampledData);

            // Send to callback (WebSocket)
            if (this.onAudioData) {
                this.onAudioData(pcm16Data.buffer);
            }
        };

        // Connect nodes: source -> processor -> destination
        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);

        console.log('Recording started');
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;

        // Disconnect and clean up nodes
        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        console.log('Recording stopped');
    }

    /**
     * Play received audio data
     */
    async playAudio(audioData) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            // Convert ArrayBuffer to Int16Array (PCM16)
            const pcm16Data = new Int16Array(audioData);

            // Convert PCM16 to Float32Array for Web Audio API
            const float32Data = this.convertToFloat32(pcm16Data);

            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.CHANNELS,
                float32Data.length,
                this.SAMPLE_RATE
            );

            // Copy data to audio buffer
            audioBuffer.getChannelData(0).set(float32Data);

            // Create buffer source node
            const sourceNode = this.audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;

            // Connect to destination (speakers)
            sourceNode.connect(this.audioContext.destination);

            // Connect to analyzer for visualization
            if (this.analyser) {
                sourceNode.connect(this.analyser);
            }

            // Schedule playback
            // Ensure we don't schedule in the past
            const startTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
            sourceNode.start(startTime);

            // Update next start time
            this.nextStartTime = startTime + audioBuffer.duration;

            // Clean up after playback
            sourceNode.onended = () => {
                sourceNode.disconnect();
            };

            this.playbackNodes.push(sourceNode);
        } catch (error) {
            console.error('Failed to play audio:', error);
        }
    }

    /**
     * Downsample audio to target sample rate
     */
    downsample(buffer, inputRate, outputRate) {
        if (inputRate === outputRate) {
            return buffer;
        }

        const compression = inputRate / outputRate;
        const length = Math.floor(buffer.length / compression);
        const result = new Float32Array(length);

        for (let i = 0; i < length; i++) {
            // Simple linear interpolation
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
    }

    /**
     * Convert Float32Array to PCM16 (Int16Array)
     */
    convertToPCM16(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);

        for (let i = 0; i < float32Array.length; i++) {
            // Clamp values to [-1, 1]
            let sample = Math.max(-1, Math.min(1, float32Array[i]));

            // Convert to 16-bit integer
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        return pcm16;
    }

    /**
     * Convert PCM16 (Int16Array) to Float32Array
     */
    convertToFloat32(int16Array) {
        const float32 = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            // Convert 16-bit integer to float [-1, 1]
            float32[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }

        return float32;
    }

    /**
     * Clear audio queue and stop current playback
     */
    clearQueue() {
        // Stop all currently playing nodes
        this.playbackNodes.forEach(node => {
            try {
                node.stop();
                node.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
        });
        this.playbackNodes = [];

        // Reset playback time to now
        if (this.audioContext) {
            this.nextStartTime = this.audioContext.currentTime;
        }

        console.log('[AudioProcessor] Audio queue cleared');
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopRecording();

        // Stop all playback
        this.clearQueue();

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        console.log('Audio resources cleaned up');
    }

    /**
     * Get current audio context state
     */
    getState() {
        return {
            isRecording: this.isRecording,
            contextState: this.audioContext?.state || 'closed',
            sampleRate: this.audioContext?.sampleRate || 0
        };
    }

    /**
     * Get frequency data for visualization
     */
    getAudioData() {
        if (!this.analyser || !this.dataArray) {
            return null;
        }
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }
}

// Export for use in main.js
window.AudioProcessor = AudioProcessor;
