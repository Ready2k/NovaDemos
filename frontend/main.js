/**
 * Main Application Logic
 * 
 * Manages:
 * - WebSocket connection
 * - UI state and interactions
 * - Integration between audio processing and WebSocket
 */

const PERSONA_PRESETS = {
    "Helpful Assistant": "You are a warm, professional, and helpful AI assistant. Give accurate answers that sound natural, direct, and human. Start by answering the user's question clearly in 1–2 sentences. Then, expand only enough to make the answer understandable, staying within 3–5 short sentences total. Avoid sounding like a lecture or essay.",
    "Sci-Fi Bot": "You are a strict compliance bot that can only talk about Science fiction. Lets make sure you greet the contact with \"Hi, I'm Barbot how can I help\". keep to the facts only",
    "Pirate": "You are a salty old pirate captain. You speak in pirate slang (Yarr, Ahoy, Matey). You are adventurous but a bit grumpy. Keep your answers short and punchy.",
    "French Tutor": "You are a patient and encouraging French language tutor. You speak mostly in English but introduce French vocabulary and phrases where appropriate. Correct the user's pronunciation and grammar gently.",
    "Concise Coder": "You are an expert software engineer. You provide code solutions that are efficient, modern, and well-commented. You explain concepts briefly and focus on the implementation. Avoid fluff.",
    "Banking Bot": "You are a professional banking assistant. You are polite, formal, and security-conscious. You can help with general banking inquiries but always remind users not to share sensitive info like PINs or passwords."
};

const VOICE_PRESETS = [
    { id: "matthew", name: "Matthew (US Male)" },
    { id: "tiffany", name: "Tiffany (US Female)" },
    { id: "amy", name: "Amy (GB Female)" },
    { id: "florian", name: "Florian (FR Male)" },
    { id: "ambre", name: "Ambre (FR Female)" }
];

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
        // Settings elements
        this.personaSelect = document.getElementById('persona-preset'); // Renamed from presetSelect for clarity in diff
        this.systemPromptInput = document.getElementById('systemPrompt');
        this.speechPromptInput = document.getElementById('speechPrompt');
        this.voiceSelect = document.getElementById('voice-preset');
        this.brainModeSelect = document.getElementById('brain-mode');
        this.debugModeCheckbox = document.getElementById('debug-mode');
        this.debugPanel = document.getElementById('debug-panel');
        this.debugContent = document.getElementById('debug-content');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        this.newSessionBtn = document.getElementById('newSessionBtn');
        this.modeSelect = document.getElementById('interaction-mode');
        this.presetSelect = document.getElementById('persona-preset'); // Kept for existing logic, but personaSelect is also present
        this.modeIndicator = document.getElementById('mode-indicator'); // New: Mode Indicator
        // Chat Input
        this.textInput = document.getElementById('textInput');
        this.sendBtn = document.getElementById('sendBtn');

        // AWS Config Elements
        this.awsConfigBtn = document.getElementById('awsConfigBtn');
        this.awsModal = document.getElementById('awsModal');
        this.awsAccessKey = document.getElementById('awsAccessKey');
        this.awsSecretKey = document.getElementById('awsSecretKey');
        this.awsRegion = document.getElementById('awsRegion');
        this.saveAwsBtn = document.getElementById('saveAwsBtn');
        this.cancelAwsBtn = document.getElementById('cancelAwsBtn');

        // Agent Config Elements
        this.agentConfigBtn = document.getElementById('agentConfigBtn');
        this.agentModal = document.getElementById('agentModal');
        this.agentList = document.getElementById('agentList');
        this.newAgentName = document.getElementById('newAgentName');
        this.newAgentId = document.getElementById('newAgentId');
        this.newAgentAliasId = document.getElementById('newAgentAliasId');
        this.addAgentBtn = document.getElementById('addAgentBtn');
        this.closeAgentBtn = document.getElementById('closeAgentBtn');

        this.customAgents = [];

        // Stats elements
        this.statDuration = document.getElementById('statDuration');
        this.statInputTokens = document.getElementById('statInputTokens');
        this.statOutputTokens = document.getElementById('statOutputTokens');
        this.statLatency = document.getElementById('statLatency');

        this.sessionStartTime = null;
        this.statsInterval = null;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;

        // Visualizer
        this.canvas = document.getElementById('visualizer');
        this.canvasCtx = this.canvas.getContext('2d');
        this.visualizerAnimationId = null;

        // Initialize UI options first
        this.initializePresets();
        this.initializeVoices();
        this.initializeTabs();
        this.loadAgents(); // Load custom agents

        // Then load saved settings
        this.loadSettings();

        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;

        // Bind event handlers
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        // Settings listeners
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.newSessionBtn.addEventListener('click', () => this.startNewSession());

        if (this.brainModeSelect) {
            this.brainModeSelect.addEventListener('change', () => this.saveSettings());
        }

        if (this.debugModeCheckbox) {
            this.debugModeCheckbox.addEventListener('change', () => {
                this.debugPanel.style.display = this.debugModeCheckbox.checked ? 'block' : 'none';
            });
        }

        if (this.personaSelect) {
            this.personaSelect.addEventListener('change', () => {
                const selectedPrompt = this.personaSelect.value;
                if (selectedPrompt) {
                    this.systemPromptInput.value = selectedPrompt;
                }
            });
        }
        if (this.voiceSelect) {
            this.voiceSelect.addEventListener('change', () => this.saveSettings());
        }
        if (this.modeSelect) {
            this.modeSelect.addEventListener('change', () => this.updateUIMode());
        }

        // AWS Config Events
        this.awsConfigBtn.addEventListener('click', () => {
            this.awsModal.style.display = 'flex';
        });
        this.cancelAwsBtn.addEventListener('click', () => {
            this.awsModal.style.display = 'none';
        });
        this.saveAwsBtn.addEventListener('click', () => this.saveAwsCredentials());

        // Agent Config Events
        this.agentConfigBtn.addEventListener('click', () => {
            this.agentModal.style.display = 'flex';
            this.renderAgentList();
        });
        this.closeAgentBtn.addEventListener('click', () => {
            this.agentModal.style.display = 'none';
        });
        this.addAgentBtn.addEventListener('click', () => this.addAgent());

        // Chat events
        this.sendBtn.addEventListener('click', () => this.sendTextMessage());
        this.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });

        this.log('Application ready');
    }

    initializePresets() {
        if (!this.presetSelect) return;

        for (const [name, prompt] of Object.entries(PERSONA_PRESETS)) {
            const option = document.createElement('option');
            option.value = prompt;
            option.textContent = name;
            this.presetSelect.appendChild(option);
        }

        // Handle mode selection
        this.modeSelect.addEventListener('change', () => this.updateUIMode());

        // Handle preset selection
        this.presetSelect.addEventListener('change', () => {
            const selectedPrompt = this.presetSelect.value;
            if (selectedPrompt) {
                this.systemPromptInput.value = selectedPrompt;
                // We don't auto-save, allowing the user to edit first
            }
        });
    }

    initializeVoices() {
        if (!this.voiceSelect) return;

        VOICE_PRESETS.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            this.voiceSelect.appendChild(option);
        });
    }

    initializeTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Add active class to clicked button
                btn.classList.add('active');

                // Show corresponding content
                const tabId = btn.getAttribute('data-tab');
                const content = document.getElementById(`tab-${tabId}`);
                if (content) {
                    content.classList.add('active');
                }
            });
        });
    }

    startNewSession() {
        if (confirm('Start a new session? This will clear the transcript and reset settings.')) {
            // Clear transcript
            this.transcriptEl.innerHTML = '';

            // Reset settings to defaults
            localStorage.removeItem('nova_system_prompt');
            localStorage.removeItem('nova_speech_prompt');
            localStorage.removeItem('nova_voice_id');
            localStorage.removeItem('nova_brain_mode'); // New: Clear brain mode

            this.systemPromptInput.value = "You are a warm, professional, and helpful AI assistant. Give accurate answers that sound natural, direct, and human. Start by answering the user's question clearly in 1–2 sentences. Then, expand only enough to make the answer understandable, staying within 3–5 short sentences total. Avoid sounding like a lecture or essay.";
            this.speechPromptInput.value = "";
            if (this.voiceSelect) this.voiceSelect.value = "matthew"; // Default
            if (this.brainModeSelect) this.brainModeSelect.value = "raw_nova"; // Default

            // Reset stats
            this.resetStats();

            // Save the reset settings (updates backend if connected)
            this.saveSettings();

            // If connected, reconnect to start fresh session
            if (this.state !== 'disconnected') {
                this.disconnect();
                setTimeout(() => this.connect(), 500);
            }
        }
    }

    loadSettings() {
        const savedSystemPrompt = localStorage.getItem('nova_system_prompt');
        const savedSpeechPrompt = localStorage.getItem('nova_speech_prompt');
        const savedVoiceId = localStorage.getItem('nova_voice_id');
        const savedBrainMode = localStorage.getItem('nova_brain_mode'); // New: Load brain mode

        if (savedSystemPrompt) {
            this.systemPromptInput.value = savedSystemPrompt;
        }
        if (savedSpeechPrompt) {
            this.speechPromptInput.value = savedSpeechPrompt;
        }
        if (savedVoiceId && this.voiceSelect) {
            this.voiceSelect.value = savedVoiceId;
        }
        if (savedBrainMode && this.brainModeSelect) { // New: Apply brain mode
            this.brainModeSelect.value = savedBrainMode;
        }
    }

    saveSettings() {
        localStorage.setItem('nova_system_prompt', this.systemPromptInput.value);
        localStorage.setItem('nova_speech_prompt', this.speechPromptInput.value);
        if (this.voiceSelect) {
            localStorage.setItem('nova_voice_id', this.voiceSelect.value);
        }
        if (this.brainModeSelect) { // New: Save brain mode
            localStorage.setItem('nova_brain_mode', this.brainModeSelect.value);
        }

        const config = this.getSessionConfig();
        const brainMode = config.config.brainMode;

        // Send update to server if connected
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(new TextEncoder().encode(JSON.stringify(config)));
            this.log(`Updated session configuration (Mode: ${brainMode})`);
        }

        // Update Mode Indicator
        if (this.modeIndicator && this.brainModeSelect) {
            const selectedOption = this.brainModeSelect.options[this.brainModeSelect.selectedIndex];
            let modeText = selectedOption ? selectedOption.text : 'Nova Sonic';
            this.modeIndicator.textContent = `Mode: ${modeText}`;

            this.modeIndicator.style.color = brainMode === 'raw_nova' ? '#94a3b8' : '#818cf8';
            this.modeIndicator.style.background = brainMode === 'raw_nova' ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)';
        }

        // Visual feedback
        const originalText = this.saveSettingsBtn.textContent;
        this.saveSettingsBtn.textContent = 'Saved!';
        this.saveSettingsBtn.style.background = '#d4edda';

        setTimeout(() => {
            this.saveSettingsBtn.textContent = originalText;
            this.saveSettingsBtn.style.background = '';
        }, 2000);
    }

    getSessionConfig() {
        let brainMode = this.brainModeSelect ? this.brainModeSelect.value.trim() : 'raw_nova';
        let agentId = undefined;
        let agentAliasId = undefined;

        const isCustomAgent = String(brainMode).startsWith('agent:');

        if (isCustomAgent) {
            const parts = brainMode.split(':');
            const index = parseInt(parts[1]);

            if (this.customAgents[index]) {
                brainMode = 'bedrock_agent';
                agentId = this.customAgents[index].id;
                agentAliasId = this.customAgents[index].aliasId;
            } else {
                console.error('[Frontend] Agent not found at index:', index);
                brainMode = 'raw_nova';
            }
        }

        return {
            type: 'sessionConfig',
            config: {
                systemPrompt: this.systemPromptInput.value,
                speechPrompt: this.speechPromptInput.value,
                voiceId: this.voiceSelect ? this.voiceSelect.value : 'matthew',
                brainMode: brainMode,
                agentId: agentId,
                agentAliasId: agentAliasId
            }
        };
    }



    /**
     * Connect to WebSocket server
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                this.ws.close();
            }

            this.updateState('connecting');
            this.log('Connecting to server...');

            let wsUrl = 'ws://localhost:8080/sonic';
            if (window.location.protocol !== 'file:') {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl = `${protocol}//${window.location.host}/sonic`;
            }

            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.log('Connected to server', 'success');
                this.updateState('connected');
                this.reconnectAttempts = 0; // Reset attempts
                this.showToast('Connected to server', 'success');

                // Start session timer
                this.startSessionTimer();
                this.startVisualizer();

                // Send ping to verify connection
                this.ws.send(JSON.stringify({ type: 'ping' }));

                // Send session configuration immediately
                try {
                    const config = this.getSessionConfig();
                    this.ws.send(JSON.stringify(config));
                    this.log('Sent persona configuration');
                    console.log('[Frontend] Sent config:', config);
                } catch (e) {
                    console.error('[Frontend] Failed to send config:', e);
                    this.log('Failed to send configuration', 'error');
                }

                resolve();
            };

            this.ws.onclose = (event) => {
                this.log(`Disconnected (code: ${event.code})`, 'warning');
                this.updateState('disconnected');

                if (event.code !== 1000 && event.code !== 1005) {
                    // Abnormal closure, attempt reconnect
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = (error) => {
                this.log('Connection error', 'error');
                console.error('WebSocket error:', error);
                this.updateState('disconnected');
                // Don't reject here as onclose will also fire
            };

            this.ws.onmessage = async (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Audio data
                    this.audioProcessor.playAudio(event.data);
                } else {
                    // JSON message
                    try {
                        const message = JSON.parse(event.data);

                        switch (message.type) {
                            case 'sessionStart':
                                this.log(`Session: ${message.sessionId}`, 'success');
                                break;

                            case 'transcript':
                                this.displayTranscript(message.role || 'assistant', message.text, message.isFinal);
                                this.log(`Transcript [${message.role}]: ${message.text}`);
                                break;

                            case 'interruption':
                                this.handleInterruption();
                                break;

                            case 'ttsOutput':
                                this.renderTTSOutput(message);
                                break;

                            case 'debugInfo':
                                this.renderDebugInfo(message.data);
                                break;

                            case 'error':
                                this.showToast(message.message, 'error');
                                break;

                            case 'usage':
                                this.updateTokenStats(message.data);
                                break;
                        }
                    } catch (e) {
                        console.error('Error parsing message:', e);
                    }
                }
            };
        });
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'User disconnected');
            this.ws = null;
        }
        this.stopRecording();
        this.audioProcessor.clearQueue();
        this.updateState('disconnected');
        this.showToast('Disconnected', 'info');

        // Clear any pending reconnect
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.stopSessionTimer();
        this.stopVisualizer();
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

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff max 10s

            this.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
            this.showToast(`Reconnecting in ${delay / 1000}s...`, 'warning');

            this.reconnectTimeout = setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            this.log('Max reconnect attempts reached', 'error');
            this.showToast('Connection failed. Please refresh.', 'error');
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        const container = document.getElementById('toast-container') || this.createToastContainer();
        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 3s
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
        return container;
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
        this.startBtn.disabled = newState !== 'connected';
        this.stopBtn.disabled = newState !== 'recording';

        // Enable text input when connected (even if not recording audio)
        const canChat = newState === 'connected' || newState === 'recording';
        this.textInput.disabled = !canChat;
        this.sendBtn.disabled = !canChat;

        // Apply mode-specific constraints
        this.updateUIMode();
    }

    /**
     * Update UI based on selected interaction mode
     */
    updateUIMode() {
        const mode = this.modeSelect.value;
        const isConnected = this.state !== 'disconnected';

        // 1. Text Input Visibility
        const showChat = mode === 'chat_voice' || mode === 'chat_only';
        this.textInput.parentElement.style.display = showChat ? 'flex' : 'none';

        // 2. Audio Controls Visibility
        const showAudio = mode === 'chat_voice' || mode === 'voice_only';
        this.startBtn.style.display = showAudio ? 'inline-block' : 'none';
        this.stopBtn.style.display = showAudio ? 'inline-block' : 'none';

        // 3. Audio Playback Muting (Chat Only = Mute)
        if (mode === 'chat_only') {
            // If we were recording, stop it
            if (this.state === 'recording') {
                this.stopRecording();
            }
            this.audioProcessor.setMuted(true);
        } else {
            this.audioProcessor.setMuted(false);
        }

        // 4. Re-evaluate disabled states based on connection
        if (isConnected) {
            if (showChat) {
                this.textInput.disabled = false;
                this.sendBtn.disabled = false;
            }
            if (showAudio) {
                this.startBtn.disabled = this.state === 'recording'; // If recording, start is disabled
                this.stopBtn.disabled = this.state !== 'recording';
            }
        }
    }

    /**
     * Display transcript in UI
     */
    displayTranscript(role, text, isFinal = true) {
        // Filter out JSON-like strings or interruption signals that might have leaked into text
        if (typeof text === 'string' && (text.includes('"interrupted"') || text.trim().startsWith('{'))) {
            return;
        }

        const lastMessage = this.transcriptEl.lastElementChild;
        const isTemporary = lastMessage && lastMessage.classList.contains('temporary');
        const isSameRole = lastMessage && lastMessage.classList.contains(role);

        if (isTemporary && isSameRole) {
            // Update existing temporary message (backend sends full accumulated text)
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

        // Log to console
        console.log(`[${timestamp}] [${type}] ${message}`);

        // Log to UI if element exists
        if (this.logEl) {
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

    startSessionTimer() {
        this.stopSessionTimer();
        this.sessionStartTime = Date.now();
        this.statsInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            if (this.statDuration) this.statDuration.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    stopSessionTimer() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    resetStats() {
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        if (this.statInputTokens) this.statInputTokens.textContent = '0';
        if (this.statOutputTokens) this.statOutputTokens.textContent = '0';
        if (this.statDuration) this.statDuration.textContent = '00:00';
        this.stopSessionTimer();
    }

    updateTokenStats(usageData) {
        if (usageData.totalInputTokens) {
            this.statInputTokens.textContent = usageData.totalInputTokens;
        }
        if (usageData.totalOutputTokens) {
            this.statOutputTokens.textContent = usageData.totalOutputTokens;
        }
    }

    startVisualizer() {
        if (!this.canvas) return;

        // Resize canvas
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;

        const draw = () => {
            this.visualizerAnimationId = requestAnimationFrame(draw);

            const width = this.canvas.width;
            const height = this.canvas.height;
            const ctx = this.canvasCtx;

            ctx.clearRect(0, 0, width, height);

            // Get audio data
            const dataArray = this.audioProcessor.getAudioData();

            if (dataArray) {
                const bufferLength = dataArray.length;
                const barWidth = (width / bufferLength) * 2.5;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * height;

                    // Dynamic color based on height/intensity
                    const hue = 240 + (barHeight / height) * 60; // Blue to Purple
                    ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;

                    // Draw mirrored bar (center aligned)
                    const y = (height - barHeight) / 2;

                    // Rounded pill shape
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
                    ctx.fill();

                    x += barWidth + 1;
                }
            } else {
                // Idle animation (gentle pulse)
                const time = Date.now() / 1000;
                const barCount = 20;
                const barWidth = width / barCount;

                for (let i = 0; i < barCount; i++) {
                    const h = 4 + Math.sin(time * 2 + i * 0.5) * 4;
                    const x = i * barWidth;
                    const y = (height - h) / 2;

                    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth - 2, h, 2);
                    ctx.fill();
                }
            }
        };
        draw();
    }

    stopVisualizer() {
        if (this.visualizerAnimationId) {
            cancelAnimationFrame(this.visualizerAnimationId);
            this.visualizerAnimationId = null;
        }
        // Clear canvas
        if (this.canvasCtx) {
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Send text message to server
     */
    sendTextMessage() {
        const text = this.textInput.value.trim();
        if (!text || this.state === 'disconnected') return;

        // Optimistically show user message
        this.displayTranscript('user', text);

        // Send to server
        this.ws.send(JSON.stringify({
            type: 'textInput',
            text: text
        }));

        // Clear input
        this.textInput.value = '';
    }

    /**
     * Send AWS Credentials to server
     */
    async saveAwsCredentials() {
        const accessKeyId = this.awsAccessKey.value.trim();
        const secretAccessKey = this.awsSecretKey.value.trim();
        const region = this.awsRegion.value.trim();

        if (!accessKeyId || !secretAccessKey || !region) {
            alert('Please fill in all AWS fields.');
            return;
            // Hide modal and clear sensitive inputs
            this.awsModal.style.display = 'none';
            this.awsAccessKey.value = '';
            this.awsSecretKey.value = '';

            this.log('Sent AWS credentials to server');
            this.showToast('AWS Credentials Updated', 'success');
        }
    }

    // --- Agent Management ---

    loadAgents() {
        const savedAgents = localStorage.getItem('custom_agents');
        if (savedAgents) {
            try {
                this.customAgents = JSON.parse(savedAgents);
            } catch (e) {
                console.error('Failed to parse saved agents:', e);
                this.customAgents = [];
            }
        }
        this.updateAgentDropdown();
    }

    saveAgents() {
        localStorage.setItem('custom_agents', JSON.stringify(this.customAgents));
        this.updateAgentDropdown();
        this.renderAgentList();
    }

    updateAgentDropdown() {
        if (!this.brainModeSelect) return;

        const currentValue = this.brainModeSelect.value;

        // Clear existing options
        this.brainModeSelect.innerHTML = '';

        // Add default options
        const defaultOptions = [
            { value: 'raw_nova', text: '✨ Nova Sonic (Direct)' },
            { value: 'bedrock_agent', text: '🏦 Banking Bot (Agent)' }
        ];

        defaultOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            this.brainModeSelect.appendChild(option);
        });

        // Add custom agents
        this.customAgents.forEach((agent, index) => {
            const option = document.createElement('option');
            option.value = `agent:${index}`; // Use index as ID reference
            option.textContent = `${agent.name} (Agent)`;
            this.brainModeSelect.appendChild(option);
        });

        // Restore selection if possible, otherwise default
        if (currentValue) {
            // Check if value still exists
            const exists = Array.from(this.brainModeSelect.options).some(o => o.value === currentValue);
            if (exists) {
                this.brainModeSelect.value = currentValue;
            } else {
                this.brainModeSelect.value = 'raw_nova';
            }
        }
    }

    renderAgentList() {
        if (!this.agentList) return;

        this.agentList.innerHTML = '';

        if (this.customAgents.length === 0) {
            this.agentList.innerHTML = '<div style="color: #64748b; font-style: italic; text-align: center;">No custom agents configured.</div>';
            return;
        }

        this.customAgents.forEach((agent, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);';

            item.innerHTML = `
                <div>
                    <div style="font-weight: 600; color: #e2e8f0;">${agent.name}</div>
                    <div style="font-size: 0.8rem; color: #94a3b8;">ID: ${agent.id.substr(0, 8)}...</div>
                </div>
                <button class="delete-agent-btn danger-btn" data-index="${index}" style="padding: 6px 12px; font-size: 0.8rem;">Delete</button>
            `;

            this.agentList.appendChild(item);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-agent-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                this.deleteAgent(index);
            });
        });
    }

    addAgent() {
        const name = this.newAgentName.value.trim();
        const id = this.newAgentId.value.trim();
        const aliasId = this.newAgentAliasId.value.trim();

        if (!name || !id || !aliasId) {
            alert('Please fill in all fields (Name, Agent ID, Agent Alias ID).');
            return;
        }

        this.customAgents.push({ name, id, aliasId });
        this.saveAgents();

        // Clear inputs
        this.newAgentName.value = '';
        this.newAgentId.value = '';
        this.newAgentAliasId.value = '';

        this.showToast(`Agent "${name}" added!`, 'success');
    }

    deleteAgent(index) {
        if (confirm(`Delete agent "${this.customAgents[index].name}"?`)) {
            this.customAgents.splice(index, 1);
            this.saveAgents();
            this.showToast('Agent deleted', 'info');
        }
    }

    handleInterruption() {
        this.log('⚡ Barge-in detected! Stopping playback.', 'warning');
        this.audioProcessor.clearQueue();
    }

    renderDebugInfo(data) {
        if (!this.debugModeCheckbox.checked) return;

        const { transcript, agentReply, trace } = data;
        let html = `<div><strong>🗣️ Transcript:</strong> "${transcript}"</div>`;

        if (trace && trace.length > 0) {
            html += `<div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 5px;"><strong>🧠 Agent Thought:</strong></div>`;
            trace.forEach(t => {
                // Check for Orchestration Trace (Tools/KB)
                // Note: Trace structure is { trace: { orchestrationTrace: ... } }
                const ot = t.trace?.orchestrationTrace || t.orchestrationTrace;

                if (ot) {
                    // Tool Usage
                    if (ot.invocationInput?.actionGroupInvocationInput) {
                        const tool = ot.invocationInput.actionGroupInvocationInput;
                        html += `<div style="color: #00ffff; margin-left: 10px;">🔧 Tool Call: ${tool.function} (${JSON.stringify(tool.parameters)})</div>`;
                    }

                    // KB Search
                    if (ot.observation?.knowledgeBaseLookupOutput?.retrievedReferences) {
                        const refs = ot.observation.knowledgeBaseLookupOutput.retrievedReferences;
                        html += `<div style="color: #ff00ff; margin-left: 10px;">📚 KB Hits: ${refs.length} references found</div>`;
                    }

                    // Rationale (Reasoning)
                    if (ot.rationale) {
                        html += `<div style="color: #ffff00; margin-left: 10px;">🤔 Reasoning: ${ot.rationale.text}</div>`;
                    }
                }
            });
        }

        html += `<div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 5px;"><strong>🤖 Agent Reply:</strong> "${agentReply}"</div>`;
        html += `<div style="color: #aaa; font-size: 10px;">🔊 Voice: ${this.voiceSelect.value}</div>`;
        html += `<div id="tts-output-container" style="margin-top: 5px; color: #888; font-style: italic;"></div>`;

        this.debugContent.innerHTML = html;
        this.debugPanel.scrollTop = this.debugPanel.scrollHeight;
    }

    renderTTSOutput(data) {
        if (!this.debugModeCheckbox.checked) return;

        const container = document.getElementById('tts-output-container');
        if (container) {
            // If it's a new turn (or we just cleared it), set it. Otherwise append/update?
            // Actually, Nova sends partials. We just want the latest text.
            container.innerHTML = `<strong>🔊 TTS Output:</strong> "${data.text}"`;
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
