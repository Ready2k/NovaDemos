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
        this.transcriptEl = document.getElementById('transcript');
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectButton');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        // Persona Settings
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.speechPromptInput = document.getElementById('speechPrompt');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');

        // Load saved settings
        this.loadSettings();

        // Bind event handlers
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

        this.log('Application ready');
    }

    loadSettings() {
        const savedSystemPrompt = localStorage.getItem('nova_system_prompt');
        const savedSpeechPrompt = localStorage.getItem('nova_speech_prompt');

        if (savedSystemPrompt) {
            this.systemPromptInput.value = savedSystemPrompt;
        }
        if (savedSpeechPrompt) {
            this.speechPromptInput.value = savedSpeechPrompt;
        }
    }

    saveSettings() {
        localStorage.setItem('nova_system_prompt', this.systemPromptInput.value);
        localStorage.setItem('nova_speech_prompt', this.speechPromptInput.value);

        // Visual feedback
        const originalText = this.saveSettingsBtn.textContent;
        this.saveSettingsBtn.textContent = 'Saved!';
        this.saveSettingsBtn.style.background = '#d4edda';

        setTimeout(() => {
            this.saveSettingsBtn.textContent = originalText;
            this.saveSettingsBtn.style.background = '';
        }, 2000);
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

                // Send session configuration
                const systemPrompt = document.getElementById('systemPrompt').value;
                const speechPrompt = document.getElementById('speechPrompt').value;

                this.ws.send(JSON.stringify({
                    type: 'sessionConfig',
                    config: {
                        systemPrompt,
                        speechPrompt
                    }
                }));
                this.log('Sent persona configuration');
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

            // Debug logging
            this.chunkCount = (this.chunkCount || 0) + 1;
            if (this.chunkCount % 50 === 0) {
                console.log(`[Frontend] Sent ${this.chunkCount} audio chunks (${audioData.byteLength} bytes each)`);
            }
        } else {
            console.warn('[Frontend] WebSocket not open, cannot send audio');
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
                    this.displayTranscript(message.role || 'assistant', message.text, message.isFinal);
                    this.log(`Transcript [${message.role}]: ${message.text}`);
                    break;

                case 'interruption':
                    this.log('⚡ Barge-in detected! Stopping playback.', 'error');
                    this.audioProcessor.clearQueue();
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
        this.disconnectBtn.disabled = newState === 'disconnected';

        this.startBtn.disabled = newState !== 'connected';
        this.stopBtn.disabled = newState !== 'recording';
    }

    /**
     * Display transcript in UI
     */
    displayTranscript(role, text, isFinal = true) {
        const lastMessage = this.transcriptEl.lastElementChild;
        const isTemporary = lastMessage && lastMessage.classList.contains('temporary');
        const isSameRole = lastMessage && lastMessage.classList.contains(role);

        if (isTemporary && isSameRole) {
            // Update existing temporary message
            lastMessage.querySelector('.text').textContent = text;
            if (isFinal) {
                lastMessage.classList.remove('temporary');
            }
        } else {
            // Create new message
            const entry = document.createElement('div');
            entry.className = `transcript-entry ${role} ${isFinal ? '' : 'temporary'}`;
            entry.innerHTML = `
                <span class="role">${role === 'assistant' ? '🤖 Assistant' : '👤 User'}:</span>
                <span class="text">${text}</span>
            `;
            this.transcriptEl.appendChild(entry);
        }

        // Auto-scroll to bottom
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;

        // Limit transcript entries
        while (this.transcriptEl.children.length > 20) {
            this.transcriptEl.removeChild(this.transcriptEl.firstChild);
        }
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
