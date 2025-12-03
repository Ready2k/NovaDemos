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

        // Audio configuration
        this.SAMPLE_RATE = 16000;
        this.CHANNELS = 1; // Mono
        this.BUFFER_SIZE = 4096;
    }

    /**
     * Initialize audio context and request microphone access
     */
    async initialize() {
        try {
            // Create audio context with specific sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.SAMPLE_RATE
            });

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

        this.onAudioData = onAudioData;
        this.isRecording = true;

        // Create source node from microphone stream
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        // Create script processor for audio processing
        // Note: ScriptProcessorNode is deprecated but widely supported
        // For production, consider using AudioWorklet
        this.processorNode = this.audioContext.createScriptProcessor(
            this.BUFFER_SIZE,
            this.CHANNELS,
            this.CHANNELS
        );

        // Process audio data
        this.processorNode.onaudioprocess = (event) => {
            if (!this.isRecording) return;

            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0); // Get mono channel

            // Convert Float32Array to PCM16 (Int16Array)
            const pcm16Data = this.convertToPCM16(inputData);

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

            // Play audio
            sourceNode.start();

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
     * Clean up resources
     */
    cleanup() {
        this.stopRecording();

        // Stop all playback
        this.playbackNodes.forEach(node => {
            try {
                node.stop();
                node.disconnect();
            } catch (e) {
                // Ignore errors
            }
        });
        this.playbackNodes = [];

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
}

// Export for use in main.js
window.AudioProcessor = AudioProcessor;
