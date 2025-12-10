/**
 * Main Application Logic
 * 
 * Manages:
 * - WebSocket connection
 * - UI state and interactions
 * - Integration between audio processing and WebSocket
 */



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
        this.sessionId = null;

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
        this.promptPresetSelect = document.getElementById('prompt-preset');
        this.debugModeCheckbox = document.getElementById('debug-mode');
        this.debugPanel = document.getElementById('debug-panel');
        this.debugContent = document.getElementById('debug-content');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        this.newSessionBtn = document.getElementById('newSessionBtn');
        this.modeSelect = document.getElementById('interaction-mode');
        this.brainModeSelect = document.getElementById('brain-mode'); // Correctly bind to the Assistant dropdown
        this.presetSelect = document.getElementById('persona-preset');

        // Handle preset selection
        if (this.presetSelect) {
            this.presetSelect.addEventListener('change', () => {
                const selectedPrompt = this.presetSelect.value;
                if (selectedPrompt) {
                    this.systemPromptInput.value = selectedPrompt;
                }
            });
        }
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
        this.agentCoreRuntimeArn = document.getElementById('agentCoreRuntimeArn');
        this.saveAwsBtn = document.getElementById('saveAwsBtn');
        this.cancelAwsBtn = document.getElementById('cancelAwsBtn');
        this.clearAwsBtn = document.getElementById('clearAwsBtn');

        // Prompt Preset Change
        if (this.promptPresetSelect) {
            this.promptPresetSelect.addEventListener('change', () => {
                const selectedOption = this.promptPresetSelect.options[this.promptPresetSelect.selectedIndex];
                if (selectedOption.value) {
                    // Store the content in a data attribute or look it up
                    // For simplicity, we'll assume the value IS the content or we look it up from a map
                    // But since we populate it dynamically, let's store content in a map
                    const content = selectedOption.getAttribute('data-content');
                    if (content) {
                        this.systemPromptInput.value = content;
                    }
                }
            });
        }

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
        this.pendingDeleteIndex = null;

        // Delete Confirmation Modal Elements
        this.deleteConfirmModal = document.getElementById('deleteConfirmModal');
        this.deleteConfirmText = document.getElementById('deleteConfirmText');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

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
        // this.initializePresets(); // Moved to loadPrompts
        this.initializeVoices();
        this.initializeTabs();
        this.loadAgents(); // Load custom agents
        this.loadTools(); // Load available tools

        // Then load saved settings
        this.loadSettings();

        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.corePrompt = ''; // Store core guardrails
        this.availableTools = []; // Store full tool definitions

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
                this.debugPanel.style.display = this.debugModeCheckbox.checked ? 'flex' : 'none';
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
            this.loadStoredAwsCredentials();
            this.awsModal.style.display = 'flex';
        });
        this.cancelAwsBtn.addEventListener('click', () => {
            this.awsModal.style.display = 'none';
            // Clear form fields
            this.awsAccessKey.value = '';
            this.awsSecretKey.value = '';
        });
        this.saveAwsBtn.addEventListener('click', () => this.saveAwsCredentials());
        this.clearAwsBtn.addEventListener('click', () => this.clearStoredAwsCredentials());

        // Agent Config Events
        this.agentConfigBtn.addEventListener('click', () => {
            this.agentModal.style.display = 'flex';
            this.renderAgentList();
        });
        this.closeAgentBtn.addEventListener('click', () => {
            this.agentModal.style.display = 'none';
        });
        this.addAgentBtn.addEventListener('click', () => this.addAgent());

        // Delete Confirmation Events
        this.cancelDeleteBtn.addEventListener('click', () => {
            this.deleteConfirmModal.style.display = 'none';
            this.pendingDeleteIndex = null;
        });
        this.confirmDeleteBtn.addEventListener('click', () => {
            if (this.pendingDeleteIndex !== null) {
                this.customAgents.splice(this.pendingDeleteIndex, 1);
                this.saveAgents();
                this.showToast('Agent deleted', 'info');
                this.deleteConfirmModal.style.display = 'none';
                this.pendingDeleteIndex = null;
            }
        });

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

    initializePresets(prompts) {
        if (!this.presetSelect) return;

        // Capture current prompt text (from text area, which might be restored from localStorage)
        const currentContent = this.systemPromptInput.value.trim();

        // Clear existing options except default
        this.presetSelect.innerHTML = '<option value="">Custom / Select Preset...</option>';

        prompts.forEach(prompt => {
            // Filter out system-internal prompts like Agent Echo from the Persona list
            if (prompt.id === 'agent_echo.txt') return;

            const option = document.createElement('option');
            option.value = prompt.content;
            option.textContent = prompt.name;
            this.presetSelect.appendChild(option);

            // Restore selection if content matches
            if (currentContent && prompt.content.trim() === currentContent) {
                option.selected = true;
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
        this.log('Starting new session...', 'info');

        // Clear transcript
        this.transcriptEl.innerHTML = '';

        // Clear debug panel
        if (this.debugContent) {
            this.debugContent.innerHTML = 'Waiting for interaction...';
        }

        // Reset settings to defaults
        localStorage.removeItem('nova_system_prompt');
        localStorage.removeItem('nova_speech_prompt');
        localStorage.removeItem('nova_voice_id');
        localStorage.removeItem('nova_brain_mode');

        this.systemPromptInput.value = "You are a warm, professional, and helpful AI assistant. Give accurate answers that sound natural, direct, and human. Start by answering the user's question clearly in 1–2 sentences. Then, expand only enough to make the answer understandable, staying within 3–5 short sentences total. Avoid sounding like a lecture or essay.";
        this.speechPromptInput.value = "";
        if (this.voiceSelect) this.voiceSelect.value = "matthew";
        if (this.brainModeSelect) this.brainModeSelect.value = "raw_nova";

        // Reset stats
        this.resetStats();

        // Save the reset settings
        this.saveSettings();

        // Disconnect if connected
        if (this.state !== 'disconnected') {
            this.disconnect();
        }

        this.log('Session reset. Ready to connect.', 'success');
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

        // Get selected tools
        const selectedTools = [];
        const toolCheckboxes = document.querySelectorAll('#tools-list input[type="checkbox"]:checked');
        toolCheckboxes.forEach(cb => {
            selectedTools.push(cb.value);
        });

        let finalSystemPrompt = '';

        // Prepend Core Guardrails (if loaded)
        if (this.corePrompt) {
            finalSystemPrompt += this.corePrompt + '\n\n';
        }

        // Add User/Persona Prompt
        finalSystemPrompt += this.systemPromptInput.value + '\n\n';

        // Append Tool Instructions if tools are selected
        // Append Tool Instructions if tools are selected
        if (selectedTools.length > 0) {
            finalSystemPrompt += '\n\n[SYSTEM INSTRUCTION: You have access to the following tools. YOU MUST USE THEM when the user asks for relevant information. Do not refuse or make up answers.]\n';

            selectedTools.forEach(toolName => {
                const toolDef = this.availableTools.find(t => t.name === toolName);
                if (toolDef && toolDef.instruction) {
                    finalSystemPrompt += `${toolDef.instruction}\n`;
                } else {
                    // Fallback if no specific instruction matches (though all should have one now)
                    finalSystemPrompt += `- Invoke tool ${toolName} if needed.\n`;
                }
            });
        }

        return {
            type: 'sessionConfig',
            config: {
                systemPrompt: finalSystemPrompt,
                speechPrompt: this.speechPromptInput.value,
                voiceId: this.voiceSelect ? this.voiceSelect.value : 'matthew',
                brainMode: brainMode,
                agentId: agentId,
                agentAliasId: agentAliasId,
                selectedTools: selectedTools
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

                // Request prompts
                this.loadPrompts();

                // Send ping to verify connection
                this.ws.send(JSON.stringify({ type: 'ping' }));

                // Send AWS credentials if available
                const storedCredentials = sessionStorage.getItem('aws_credentials');
                if (storedCredentials) {
                    try {
                        const awsCredentials = JSON.parse(storedCredentials);
                        const awsConfig = {
                            type: 'awsConfig',
                            config: awsCredentials
                        };
                        this.ws.send(JSON.stringify(awsConfig));
                        this.log('Sent stored AWS credentials to server');
                    } catch (e) {
                        console.error('[Frontend] Failed to send AWS credentials:', e);
                        this.log('Failed to send AWS credentials', 'error');
                    }
                }

                // Send session configuration immediately
                try {
                    const config = this.getSessionConfig();
                    this.ws.send(JSON.stringify(config));
                    this.log('Sent persona configuration');
                    console.log('[Frontend] Sent config:', config);
                    
                    // Show that AI is preparing to greet
                    this.showToast('AI is greeting you...', 'info');
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
                            case 'connected':
                                this.sessionId = message.sessionId;
                                this.log(`Connected: ${message.sessionId}`, 'success');
                                if (this.debugContent) {
                                    const timestamp = new Date().toISOString();
                                    this.debugContent.innerHTML = `
                                        <div style="padding: 12px; border: 1px solid #4f46e5; border-radius: 6px; margin-bottom: 12px; background: rgba(79, 70, 229, 0.1);">
                                            <div style="color: #818cf8; font-weight: 600; margin-bottom: 6px;">🔌 Session Information</div>
                                            <div style="color: #c7d2fe; font-size: 0.9rem; font-family: 'JetBrains Mono', monospace;">
                                                <div><strong>Session ID:</strong> ${this.sessionId}</div>
                                                <div><strong>Connected:</strong> ${timestamp}</div>
                                                <div><strong>Status:</strong> Active</div>
                                            </div>
                                        </div>
                                    `;
                                }
                                break;

                            case 'sessionStart':
                                this.log(`Session: ${message.sessionId}`, 'success');
                                break;

                            case 'transcript':
                                this.displayTranscript(message.role || 'assistant', message.text, message.isFinal, message.isStreaming);
                                this.log(`Transcript [${message.role}]: ${message.text}`);
                                break;

                            case 'transcriptCancelled':
                                this.cancelStreamingTranscript(message.role);
                                break;

                            case 'interruption':
                                this.handleInterruption();
                                break;

                            case 'ttsOutput':
                                this.renderTTSOutput(message);
                                break;

                            case 'debugInfo':
                                this.renderDebugInfo(message.data);
                                // NEW: Visual feedback for Tool Calls with deduplication
                                if (message.data.toolUse) {
                                    const toolName = message.data.toolUse.name || 'Unknown Tool';
                                    const toolUseId = message.data.toolUse.toolUseId;
                                    
                                    // Prevent duplicate toasts for the same tool execution
                                    if (!this.recentToolNotifications) {
                                        this.recentToolNotifications = new Set();
                                    }
                                    
                                    if (!this.recentToolNotifications.has(toolUseId)) {
                                        this.recentToolNotifications.add(toolUseId);
                                        this.showToast(`🛠️ Processing: ${toolName}`, 'info');

                                        // Visual Status Update
                                        const originalStatus = this.statusEl.textContent;
                                        this.statusEl.textContent = `Processing ${toolName}...`;
                                        this.statusEl.classList.add('recording'); // Pulse effect

                                        // Revert status after 4 seconds (or when next event comes)
                                        setTimeout(() => {
                                            if (this.statusEl.textContent.includes('Processing')) {
                                                this.statusEl.textContent = originalStatus;
                                                this.statusEl.classList.remove('recording');
                                                if (this.state === 'recording') this.statusEl.classList.add('recording');
                                            }
                                        }, 4000);
                                        
                                        // Clean up old notifications after 30 seconds
                                        setTimeout(() => {
                                            this.recentToolNotifications.delete(toolUseId);
                                        }, 30000);
                                    }
                                }
                                break;

                            case 'error':
                                this.showToast(message.message, 'error');
                                break;

                            case 'usage':
                                this.updateTokenStats(message.data);
                                // Also show in debug panel
                                this.renderDebugInfo({
                                    metrics: {
                                        inputTokens: message.data.totalInputTokens,
                                        outputTokens: message.data.totalOutputTokens,
                                        totalTokens: message.data.totalTokens
                                    }
                                });
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
     * Display transcript in UI with streaming support
     */
    displayTranscript(role, text, isFinal = true, isStreaming = false) {
        // Filter out JSON-like strings or interruption signals that might have leaked into text
        if (typeof text === 'string' && (text.includes('"interrupted"') || text.trim().startsWith('{'))) {
            return;
        }

        // Filter out empty or whitespace-only text
        if (!text || text.trim().length === 0) {
            return;
        }

        const lastMessage = this.transcriptEl.lastElementChild;
        const isTemporary = lastMessage && lastMessage.classList.contains('temporary');
        const isStreamingMsg = lastMessage && lastMessage.classList.contains('streaming');
        const isSameRole = lastMessage && lastMessage.classList.contains(role);

        // STREAMING MODE: Update existing streaming message
        if (isStreaming && (isTemporary || isStreamingMsg) && isSameRole) {
            // Update the text content with the accumulated text
            lastMessage.querySelector('.text').textContent = text;
            lastMessage.classList.add('streaming');
            return;
        }

        // FINALIZE: Convert streaming message to final
        if (isFinal && (isTemporary || isStreamingMsg) && isSameRole) {
            const lastText = lastMessage.querySelector('.text').textContent;
            // Only update if the text is different or longer
            if (text.length >= lastText.length) {
                lastMessage.querySelector('.text').textContent = text;
                lastMessage.classList.remove('temporary', 'streaming');
            }
            return;
        }

        // Check if this is the same text as the last message (prevent exact duplicates)
        if (lastMessage && isSameRole && !isStreaming) {
            const lastText = lastMessage.querySelector('.text').textContent;
            if (lastText === text && isFinal && !isTemporary) {
                return; // Don't create duplicate final message
            }
        }

        // CREATE NEW MESSAGE
        if (!isSameRole || (!isTemporary && !isStreamingMsg)) {
            const entry = document.createElement('div');
            entry.className = `transcript-entry ${role}`;
            if (!isFinal || isStreaming) {
                entry.classList.add('temporary');
            }
            if (isStreaming) {
                entry.classList.add('streaming');
            }

            const roleSpan = document.createElement('span');
            roleSpan.className = 'role';
            roleSpan.textContent = role === 'assistant' ? '🤖 Assistant: ' : '👤 User: ';

            const textSpan = document.createElement('span');
            textSpan.className = 'text';
            textSpan.textContent = text;

            entry.appendChild(roleSpan);
            entry.appendChild(textSpan);

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
     * Cancel/remove streaming transcript when interrupted
     */
    cancelStreamingTranscript(role) {
        const lastMessage = this.transcriptEl.lastElementChild;
        const isStreamingMsg = lastMessage && lastMessage.classList.contains('streaming');
        const isSameRole = lastMessage && lastMessage.classList.contains(role);

        if (isStreamingMsg && isSameRole) {
            // Remove the interrupted streaming message
            lastMessage.remove();
            this.log('Streaming transcript cancelled due to interruption', 'info');
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
     * Load stored AWS credentials into the form
     */
    loadStoredAwsCredentials() {
        const storedCredentials = sessionStorage.getItem('aws_credentials');
        if (storedCredentials) {
            try {
                const awsCredentials = JSON.parse(storedCredentials);
                // Don't populate sensitive fields for security, but show region and ARN
                this.awsRegion.value = awsCredentials.region || 'us-east-1';
                this.agentCoreRuntimeArn.value = awsCredentials.agentCoreRuntimeArn || '';
                
                // Show placeholder text to indicate credentials are stored
                this.awsAccessKey.placeholder = 'Stored (enter new to update)';
                this.awsSecretKey.placeholder = 'Stored (enter new to update)';
            } catch (e) {
                console.error('[Frontend] Failed to parse stored AWS credentials:', e);
            }
        } else {
            // Reset placeholders if no credentials stored
            this.awsAccessKey.placeholder = 'AKIA...';
            this.awsSecretKey.placeholder = 'wJalrX...';
        }
    }

    /**
     * Save AWS Credentials locally for connection
     */
    async saveAwsCredentials() {
        const accessKeyId = this.awsAccessKey.value.trim();
        const secretAccessKey = this.awsSecretKey.value.trim();
        const region = this.awsRegion.value.trim();
        const agentCoreRuntimeArn = this.agentCoreRuntimeArn.value.trim();

        if (!accessKeyId || !secretAccessKey || !region) {
            alert('Please fill in all required AWS fields (Access Key, Secret Key, and Region).');
            return;
        }

        // Store credentials in sessionStorage (not localStorage for security)
        const awsCredentials = {
            accessKeyId,
            secretAccessKey,
            region,
            agentCoreRuntimeArn: agentCoreRuntimeArn || undefined
        };

        sessionStorage.setItem('aws_credentials', JSON.stringify(awsCredentials));

        // If already connected, send update to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const awsConfig = {
                type: 'awsConfig',
                config: awsCredentials
            };
            this.ws.send(JSON.stringify(awsConfig));
            this.log('Updated AWS credentials on server');
            this.showToast('AWS Credentials Updated', 'success');
        } else {
            this.log('AWS credentials saved for next connection');
            this.showToast('AWS Credentials Saved - Connect to apply', 'success');
        }

        // Hide modal and clear sensitive inputs
        this.awsModal.style.display = 'none';
        this.awsAccessKey.value = '';
        this.awsSecretKey.value = '';
        // Keep region and ARN for convenience
    }

    /**
     * Clear stored AWS credentials
     */
    clearStoredAwsCredentials() {
        if (confirm('Are you sure you want to clear stored AWS credentials?')) {
            sessionStorage.removeItem('aws_credentials');
            this.showToast('AWS Credentials Cleared', 'info');
            this.log('Cleared stored AWS credentials');
            
            // Reset form
            this.awsAccessKey.value = '';
            this.awsSecretKey.value = '';
            this.awsRegion.value = 'us-east-1';
            this.agentCoreRuntimeArn.value = '';
            this.awsAccessKey.placeholder = 'AKIA...';
            this.awsSecretKey.placeholder = 'wJalrX...';
            
            this.awsModal.style.display = 'none';
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
        this.pendingDeleteIndex = index;
        const agentName = this.customAgents[index].name;
        this.deleteConfirmText.textContent = `Are you sure you want to delete agent "${agentName}"?`;
        this.deleteConfirmModal.style.display = 'flex';
    }

    handleInterruption() {
        this.log('⚡ Barge-in detected! Stopping playback.', 'warning');
        this.audioProcessor.clearQueue();
    }

    renderDebugInfo(data) {
        if (!this.debugModeCheckbox.checked) return;
        if (!this.debugContent) return;

        // 1. Errors
        if (data.error) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `margin-top: 12px; padding: 12px; background: rgba(220, 38, 38, 0.1); border-left: 3px solid #ef4444; border-radius: 4px; color: #fca5a5; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;`;
            errorDiv.innerHTML = `
                <div style="font-weight: 700; color: #ef4444;">⚠️ ${data.error.message}</div>
                <div style="opacity: 0.9;">${data.error.details}</div>
            `;
            this.debugContent.appendChild(errorDiv);
            this.debugContent.scrollTop = this.debugContent.scrollHeight;
            return;
        }

        // 2. System Info
        if (data.systemInfo) {
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'margin-bottom: 16px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;';
            infoDiv.innerHTML = `
                <div style="color: #60a5fa; font-weight: 600;">System Active</div>
                <div style="font-size: 0.85rem; color: #93c5fd;">Mode: ${data.systemInfo.mode}</div>
                <div style="font-size: 0.85rem; color: #93c5fd;">Persona: ${data.systemInfo.persona}</div>
            `;
            this.debugContent.innerHTML = '';
            this.debugContent.appendChild(infoDiv);
            return;
        }

        // 3. Persistent Metrics
        if (data.metrics) {
            const panel = document.getElementById('live-metrics-panel');
            const latencyEl = document.getElementById('debug-latency');
            const tokensEl = document.getElementById('debug-tokens');
            if (panel && latencyEl && tokensEl) {
                panel.style.display = 'block';
                const lat = data.metrics.latencyMs || data.metrics.processingTime || data.metrics.latency || '--';
                latencyEl.textContent = lat !== '--' ? `${lat}ms` : lat;
                if (data.metrics.usage) {
                    tokensEl.textContent = data.metrics.usage.totalTokens || '0';
                    tokensEl.title = `In: ${data.metrics.usage.inputTokens}, Out: ${data.metrics.usage.outputTokens}`;
                }
            }
            return;
        }

        // 4. Turn Data (Transcript, Trace, Reply)
        let html = '';

        if (data.transcript) {
            html += `<div style="margin-top: 12px; color: #94a3b8; font-size: 0.8rem;">User Input</div>
                     <div style="color: #e2e8f0; margin-bottom: 8px;">"${data.transcript}"</div>`;
        }

        if (data.agentReply) {
            // Show stage indicator for streaming vs final
            const stageColor = data.stage === 'FINAL' ? '#86efac' : 
                              data.stage === 'STREAMING' ? '#fbbf24' : 
                              data.stage === 'USER_INPUT' ? '#60a5fa' : '#94a3b8';
            const stageIcon = data.stage === 'FINAL' ? '✓' : 
                             data.stage === 'STREAMING' ? '⋯' : 
                             data.stage === 'USER_INPUT' ? '👤' : '•';
            const stageLabel = data.stage || (data.isFinal ? 'FINAL' : 'STREAMING');
            
            html += `<div style="color: #94a3b8; font-size: 0.8rem;">
                        Agent Response 
                        <span style="color: ${stageColor}; font-weight: 600; margin-left: 8px;">${stageIcon} ${stageLabel}</span>
                     </div>
                     <div style="color: ${stageColor}; margin-bottom: 8px;">"${data.agentReply}"</div>`;
        }

        // Show Tool Use if present
        if (data.toolUse) {
            html += `<div style="margin-top: 8px; padding: 8px; background: rgba(139, 92, 246, 0.1); border-left: 3px solid #a78bfa; border-radius: 4px;">
                        <div style="color: #c4b5fd; font-size: 0.8rem; font-weight: 600;">🛠️ Tool Call</div>
                        <div style="color: #e9d5ff; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;">
                            ${data.toolUse.name}
                        </div>
                        <div style="color: #ddd6fe; font-size: 0.75rem; margin-top: 4px;">
                            ${JSON.stringify(data.toolUse.input, null, 2)}
                        </div>
                     </div>`;
        }

        // Render Reasoning Trace
        if (data.trace && data.trace.length > 0) {
            html += `<div style="color: #94a3b8; font-size: 0.8rem;">Reasoning Trace</div>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-x: auto;">`;

            data.trace.forEach(step => {
                const tr = step.trace || step;
                const ot = tr.orchestrationTrace || tr.trace?.orchestrationTrace;
                if (ot) {
                    const type = Object.keys(ot)[0];
                    html += `<div style="margin-bottom: 4px;"><span style="color: #c084fc;">[${type}]</span></div>`;
                    if (ot.rationale) {
                        html += `<div style="color: #ffff00; margin-left: 10px; font-style: italic;">"${ot.rationale.text}"</div>`;
                    }
                    if (ot.invocationInput?.actionGroupInvocationInput) {
                        const tool = ot.invocationInput.actionGroupInvocationInput;
                        html += `<div style="color: #00ffff; margin-left: 10px;">🔧 ${tool.function}</div>`;
                    }
                }
            });
            html += `</div>`;
        }

        if (html) {
            const turnDiv = document.createElement('div');
            turnDiv.className = 'debug-entry';
            turnDiv.style.cssText = 'margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); paddingTop: 16px;';
            turnDiv.innerHTML = html;
            this.debugContent.appendChild(turnDiv);
            this.debugContent.scrollTop = this.debugContent.scrollHeight;
        }
    }

    renderTTSOutput(data) {
        if (!this.debugModeCheckbox.checked) return;
        const container = document.getElementById('tts-output-container');
        if (container) {
            container.innerHTML = `<strong>🔊 TTS Output:</strong> "${data.text}"`;
        }
    }

    async loadPrompts() {
        try {
            console.log('[Frontend] Fetching prompts from API...');
            const response = await fetch('/api/prompts');
            if (response.ok) {
                const allPrompts = await response.json();

                // Extract Core Guardrails
                const corePromptObj = allPrompts.find(p => p.id === 'core_guardrails.txt');
                if (corePromptObj) {
                    this.corePrompt = corePromptObj.content;
                    console.log('[Frontend] Loaded Core Guardrails');
                }

                // Filter out system files from UI
                const visiblePrompts = allPrompts.filter(p =>
                    p.id !== 'core_guardrails.txt' &&
                    p.id !== 'sonic_agent_core.txt' &&
                    p.id !== 'system_default.txt'
                );

                this.updatePromptDropdown(visiblePrompts);
                this.initializePresets(visiblePrompts);
            } else {
                console.error('[Frontend] Failed to fetch prompts:', response.status);
            }
        } catch (err) {
            console.error('[Frontend] Error fetching prompts:', err);
        }
    }

    updatePromptDropdown(prompts) {
        if (!this.promptPresetSelect) return;
        this.promptPresetSelect.innerHTML = '<option value="">Custom / Select Preset...</option>';
        prompts.forEach(prompt => {
            const option = document.createElement('option');
            option.value = prompt.id;
            option.textContent = prompt.name;
            option.setAttribute('data-content', prompt.content);
            this.promptPresetSelect.appendChild(option);
        });
    }

    async loadTools() {
        try {
            const response = await fetch('/api/tools');
            if (response.ok) {
                const tools = await response.json();
                this.availableTools = tools; // Store for config interaction
                const container = document.getElementById('tools-list');
                if (container) {
                    container.innerHTML = ''; // Clear loading state

                    if (tools.length === 0) {
                        container.innerHTML = '<div style="font-size: 0.8rem; color: #64748b;">No tools found.</div>';
                        return;
                    }

                    tools.forEach(tool => {
                        const div = document.createElement('div');
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.gap = '8px';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `tool-${tool.name}`;
                        checkbox.value = tool.name;

                        const label = document.createElement('label');
                        label.htmlFor = `tool-${tool.name}`;
                        label.style.fontSize = '0.9rem';
                        label.style.cursor = 'pointer';
                        label.style.color = '#e2e8f0';
                        label.textContent = tool.name;

                        // Tooltip for description
                        label.title = tool.description || '';

                        div.appendChild(checkbox);
                        div.appendChild(label);
                        container.appendChild(div);
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load tools:', e);
            const container = document.getElementById('tools-list');
            if (container) container.innerHTML = '<div style="color: #ef4444; font-size: 0.8rem;">Failed to load tools</div>';
        }
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAssistant();
    window.app.loadPrompts(); // Load prompts immediately
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.disconnect();
    }
});
