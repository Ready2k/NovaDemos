/**
 * Main Application Logic
 * 
 * Manages:
 * - WebSocket connection
 * - UI state and interactions
 * - Integration between audio processing and WebSocket
 */

class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.audioProcessor = new AudioProcessor();
        this.state = 'disconnected'; // disconnected, connected, recording

        // WebSocket configuration
        this.WS_URL = 'ws://localhost:8080/sonic';

        // UI elements
        this.statusEl = document.getElementById('status');
        this.logEl = document.getElementById('log');
        this.connectBtn = document.getElementById('connectBtn');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');

        // Bind event handlers
        this.connectBtn.addEventListener('click', () => this.connect());
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());

        this.log('Application ready');
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.log('Already connected', 'error');
            return;
        }

        this.log('Connecting to server...');

        try {
            this.ws = new WebSocket(this.WS_URL);

            // Set binary type for audio data
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.log('Connected to server', 'success');
                this.updateState('connected');
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onerror = (error) => {
                this.log('WebSocket error', 'error');
                console.error('WebSocket error:', error);
            };

            this.ws.onclose = (event) => {
                this.log(`Disconnected (code: ${event.code})`, 'error');
                this.updateState('disconnected');

                // Clean up audio on disconnect
                if (this.state === 'recording') {
                    this.audioProcessor.stopRecording();
                }
            };

        } catch (error) {
            this.log('Failed to connect: ' + error.message, 'error');
            console.error('Connection error:', error);
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.audioProcessor.cleanup();
        this.updateState('disconnected');
        this.log('Disconnected');
    }

    /**
     * Start recording and streaming audio
     */
    async startRecording() {
        if (this.state !== 'connected') {
            this.log('Must be connected to start recording', 'error');
            return;
        }

        try {
            this.log('Starting microphone...');

            // Start audio recording with callback to send data via WebSocket
            await this.audioProcessor.startRecording((audioData) => {
                this.sendAudioData(audioData);
            });

            this.updateState('recording');
            this.log('Recording started', 'success');

        } catch (error) {
            this.log('Failed to start recording: ' + error.message, 'error');
            console.error('Recording error:', error);
        }
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (this.state !== 'recording') {
            return;
        }

        this.audioProcessor.stopRecording();
        this.updateState('connected');
        this.log('Recording stopped');
    }

    /**
     * Send audio data to WebSocket server
     */
    sendAudioData(audioData) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(audioData);
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        // Handle binary audio data
        if (data instanceof ArrayBuffer) {
            // Play received audio (echo from server)
            this.audioProcessor.playAudio(data);
            return;
        }

        // Handle JSON messages
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'connected':
                    this.log(`Session: ${message.sessionId}`, 'success');
                    break;

                case 'transcript':
                    this.log(`Transcript: ${message.text}`);
                    break;

                case 'error':
                    this.log(`Error: ${message.message}`, 'error');
                    break;

                default:
                    console.log('Unknown message type:', message);
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    }

    /**
     * Update application state and UI
     */
    updateState(newState) {
        this.state = newState;

        // Update status indicator
        this.statusEl.className = `status ${newState}`;

        const stateLabels = {
            disconnected: 'Disconnected',
            connected: 'Connected',
            recording: 'Recording...'
        };

        this.statusEl.textContent = stateLabels[newState] || newState;

        // Update button states
        this.connectBtn.disabled = newState !== 'disconnected';
        this.connectBtn.textContent = newState === 'disconnected' ? 'Connect' : 'Connected';

        this.startBtn.disabled = newState !== 'connected';
        this.stopBtn.disabled = newState !== 'recording';
    }

    /**
     * Log message to UI
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `
      <span class="timestamp">${timestamp}</span>
      <span>${message}</span>
    `;

        this.logEl.appendChild(entry);

        // Auto-scroll to bottom
        this.logEl.scrollTop = this.logEl.scrollHeight;

        // Limit log entries
        while (this.logEl.children.length > 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAssistant();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.disconnect();
    }
});
