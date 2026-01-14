/**
 * Main Application Logic
 * 
 * Manages:
 * - WebSocket connection
 * - UI state and interactions
 * - Integration between audio processing and WebSocket
 */



// Voice presets will be loaded dynamically from the backend
let VOICE_PRESETS = [
    // Fallback voices if dynamic loading fails
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
        this.saveSettingsBtn = document.getElementById('nav-action-save'); // Re-bind to nav item
        this.newSessionBtn = document.getElementById('nav-action-new'); // Re-bind to nav item
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
        this.awsSessionToken = document.getElementById('awsSessionToken'); // New Field
        this.awsRegion = document.getElementById('awsRegion');
        this.agentCoreRuntimeArn = document.getElementById('agentCoreRuntimeArn');
        this.saveAwsBtn = document.getElementById('saveAwsBtn');
        this.cancelAwsBtn = document.getElementById('cancelAwsBtn');
        this.clearAwsBtn = document.getElementById('clearAwsBtn');
        this.novaSonicModelId = document.getElementById('novaSonicModelId');

        // Live Session Elements
        this.liveStatusIndicator = document.getElementById('live-status-indicator');
        this.liveMomentsList = document.getElementById('live-moments-list');
        this.liveMomentsHeader = document.getElementById('live-moments-header');

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
        this.pendingConfirmAction = null;

        // Delete Confirmation Modal Elements
        this.deleteConfirmModal = document.getElementById('deleteConfirmModal');
        this.deleteConfirmText = document.getElementById('deleteConfirmText');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

        // Knowledge Base Elements
        this.kbList = document.getElementById('kbList');
        this.newKbName = document.getElementById('newKbName');
        this.newKbId = document.getElementById('newKbId');
        this.newKbModel = document.getElementById('newKbModel');
        this.addKbBtn = document.getElementById('addKbBtn');
        this.pendingKbDeleteId = null;
        this.editingKbId = null;

        // Tool Selection Elements
        this.toolsSelectAllBtn = document.getElementById('tools-select-all');
        this.toolsDeselectAllBtn = document.getElementById('tools-deselect-all');
        this.toolsList = document.getElementById('tools-list');

        // Stats Elements
        this.statDuration = document.getElementById('statDuration');
        this.statInputTokens = document.getElementById('statInputTokens');
        this.statOutputTokens = document.getElementById('statOutputTokens');
        this.statLatency = document.getElementById('statLatency');

        this.sessionStartTime = null;
        this.statsInterval = null;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;

        if (this.toolsSelectAllBtn) {
            this.toolsSelectAllBtn.addEventListener('click', () => {
                if (this.toolsList) {
                    const checkboxes = this.toolsList.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => cb.checked = true);
                }
            });
        }

        if (this.toolsDeselectAllBtn) {
            this.toolsDeselectAllBtn.addEventListener('click', () => {
                if (this.toolsList) {
                    const checkboxes = this.toolsList.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => cb.checked = false);
                }
            });
        }

        // Visualizer
        this.canvas = document.getElementById('visualizer');
        this.canvasCtx = this.canvas.getContext('2d');
        this.visualizerAnimationId = null;

        // Initialize
        // Initialize UI options first
        // this.initializePresets(); // Moved to loadPrompts
        this.initializeVoices(); // This is now async but we don't need to await it
        this.initializeSidebarNav();
        this.loadAgents(); // Load custom agents
        this.loadTools(); // Load available tools
        this.loadWorkflows(); // Load available workflows for coupler
        this.loadKnowledgeBases(); // Load KBs
        this.loadBedrockModels(); // Load models



        // Then load saved settings
        this.loadSettings();

        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.corePrompt = ''; // Store core guardrails
        this.availableTools = []; // Store full tool definitions

        this.currentHistoryData = null; // Store current session data

        // Bind event handlers
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());

        if (this.brainModeSelect) {
            this.brainModeSelect.addEventListener('change', () => {
                this.updateAgentDescription();
                this.autoSelectWorkflowForPersona(); // Trigger auto-select
            });
        }

        // Add listener for Persona Preset change
        if (this.presetSelect) {
            this.presetSelect.addEventListener('change', () => {
                this.autoSelectWorkflowForPersona();
            });
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
            this.awsModal.style.display = 'none';
            // Clear form fields
            this.awsAccessKey.value = '';
            this.awsSecretKey.value = '';
            this.awsSessionToken.value = '';
            this.novaSonicModelId.value = 'amazon.nova-2-sonic-v1:0';
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
            this.pendingKbDeleteId = null;
            this.pendingConfirmAction = null;
        });
        this.confirmDeleteBtn.addEventListener('click', () => {
            if (this.pendingConfirmAction) {
                this.pendingConfirmAction();
                this.pendingConfirmAction = null;
                this.deleteConfirmModal.style.display = 'none';
                return;
            }

            if (this.pendingDeleteIndex !== null) {
                this.customAgents.splice(this.pendingDeleteIndex, 1);
                this.saveAgents();
                this.showToast('Agent deleted', 'info');
                this.deleteConfirmModal.style.display = 'none';
                this.pendingDeleteIndex = null;
            } else if (this.pendingKbDeleteId !== null) {
                // Handle KB Deletion
                this.deleteKnowledgeBase(this.pendingKbDeleteId);
                this.deleteConfirmModal.style.display = 'none';
                this.pendingKbDeleteId = null;
            }
        });

        // Knowledge Base Events
        if (this.addKbBtn) {
            this.addKbBtn.addEventListener('click', () => this.addKnowledgeBase());
        }

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
        let currentContent = this.systemPromptInput.value.trim();

        // Clear existing options except default
        this.presetSelect.innerHTML = '<option value="">Custom / Select Preset...</option>';

        prompts.forEach(prompt => {
            // Filter out core platform prompts from the Persona list - only show persona- prefixed prompts
            if (prompt.id.startsWith('core-')) return;

            const option = document.createElement('option');
            option.value = prompt.content;
            option.textContent = prompt.name;
            option.setAttribute('data-id', prompt.id); // Store ID for retrieval
            this.presetSelect.appendChild(option);

            // Restore selection if content matches
            if (currentContent && prompt.content.trim() === currentContent) {
                option.selected = true;
            }
            // AUTO-SELECT DEFAULT: Banking Disputes Lite (if nothing else matched)
            else if (!currentContent && prompt.id === 'persona-BankingDisputesLite.txt') {
                option.selected = true;
                this.systemPromptInput.value = prompt.content; // Populate text area
                currentContent = prompt.content; // Prevent overwriting by subsequent defaults

                // Trigger workflow/description updates if applicable
                // (Deferred until next event loop to ensure DOM is ready)
                setTimeout(() => {
                    if (this.autoSelectWorkflowForPersona) this.autoSelectWorkflowForPersona();
                    if (this.updateAgentDescription) this.updateAgentDescription();
                }, 100);
            }
        });
    }


    async initializeVoices() {
        if (!this.voiceSelect) return;

        try {
            // Fetch voices dynamically from backend
            const response = await fetch('/api/voices');
            if (response.ok) {
                const voices = await response.json();
                VOICE_PRESETS = voices; // Update global array
                console.log(`[VoiceAssistant] Loaded ${voices.length} voices from backend`);
            } else {
                console.warn('[VoiceAssistant] Failed to fetch voices from backend, using fallback');
            }
        } catch (error) {
            console.warn('[VoiceAssistant] Error fetching voices, using fallback:', error);
        }

        // Clear existing options
        this.voiceSelect.innerHTML = '';

        // Populate voice options
        VOICE_PRESETS.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            this.voiceSelect.appendChild(option);
        });

        console.log(`[VoiceAssistant] Initialized ${VOICE_PRESETS.length} voice options`);
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

    initializeSidebarNav() {
        const navItems = document.querySelectorAll('.nav-item');
        const views = document.querySelectorAll('.sidebar-view');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                // Handle Logout separately
                if (item.id === 'nav-logout') {
                    if (confirm('Reload application?')) {
                        location.reload();
                    }
                    return;
                }

                // Handle Save Action
                if (item.id === 'nav-action-save') {
                    this.saveSettings();
                    return;
                }

                // Handle New Session Action
                if (item.id === 'nav-action-new') {
                    if (this.state === 'recording') {
                        this.showToast('Please stop recording first', 'warning');
                        return;
                    }
                    this.startNewSession();
                    return;
                }

                // Handle Live/Home View
                if (item.id === 'nav-live') {
                    // Update Nav
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');

                    // Deselect all settings views
                    views.forEach(v => v.classList.remove('active'));

                    const liveView = document.getElementById('view-live');
                    if (liveView) {
                        liveView.classList.add('active');
                    }

                    return;
                }

                // Identify target view
                const viewId = item.id.replace('nav-', 'view-');
                const targetView = document.getElementById(viewId);

                if (targetView) {
                    // Update Nav Active State
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');

                    // Update View Active State
                    views.forEach(v => v.classList.remove('active'));
                    targetView.classList.add('active');



                    // Special handling for Chat History view
                    if (viewId === 'view-chat') {
                        this.renderChatHistory();
                    }
                }
            });
        });

        // Chat History Filter Listeners
        const historySearch = document.getElementById('history-search');
        const historyDateFilter = document.getElementById('history-date-filter');
        // Checkbox Listener
        const historyFinalCheckbox = document.getElementById('history-final-checkbox');

        if (historyFinalCheckbox) {
            historyFinalCheckbox.addEventListener('change', () => {
                this.renderChatHistory(); // Updates listing (to update message counts if logic changes)
                if (this.currentHistoryData) {
                    this.renderCurrentSession(); // Updates transcript view if active
                }
            });
        }
    }

    /**
     * Add an item to the "Key Moments" timeline
     * @param {string} type - 'connected', 'disconnected', 'tool', 'error'
     * @param {string} title 
     * @param {string} details 
     */
    addKeyMoment(type, title, details = '') {
        if (!this.liveMomentsList) return;

        // Remove "Session not started" placeholder if present
        const placeholder = this.liveMomentsList.querySelector('div[style*="font-style: italic"]');
        if (placeholder) {
            placeholder.remove();
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const item = document.createElement('div');
        item.className = `moment-item ${type === 'disconnected' ? 'error' : type === 'connected' ? 'success' : type}`;

        let detailsHtml = '';
        if (details) {
            detailsHtml = `<div class="moment-details">${details}</div>`;
        }

        item.innerHTML = `
            <div class="moment-header">
                <span class="moment-title">${title}</span>
                <span class="moment-time">${timeStr}</span>
            </div>
            ${detailsHtml}
        `;

        this.liveMomentsList.prepend(item); // Add to top
    }



    getFilteredMessages(transcript, showFinalOnly) {
        if (!transcript || !Array.isArray(transcript)) return [];

        if (!showFinalOnly) {
            return transcript;
        }

        // 1. Filter out speculative assistant messages
        const nonSpeculative = transcript.filter(msg => msg.type !== 'speculative');

        // 2. Filter out consecutive user messages (keep only the last one)
        const result = [];
        for (let i = 0; i < nonSpeculative.length; i++) {
            const current = nonSpeculative[i];
            const next = (i + 1 < nonSpeculative.length) ? nonSpeculative[i + 1] : null;

            if (current.role === 'user') {
                // Check if next message is also user
                if (next && next.role === 'user') {
                    continue; // Skip this one, it's an intermediate update
                }
            }
            result.push(current);
        }
        return result;
    }

    getFilteredMessageCount(transcript, showFinalOnly) {
        return this.getFilteredMessages(transcript, showFinalOnly).length;
    }

    async renderChatHistory() {
        const container = document.getElementById('chat-history-list');
        // Real History Data
        try {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">Loading history...</div>';

            const response = await fetch('/api/history');
            if (!response.ok) throw new Error('Failed to fetch history');

            const historyFiles = await response.json();

            if (historyFiles.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">No history found.</div>';
                return;
            }

            // Apply Filters
            const searchText = document.getElementById('history-search') ? document.getElementById('history-search').value.toLowerCase() : '';
            const dateFilter = document.getElementById('history-date-filter') ? document.getElementById('history-date-filter').value : '';

            let filteredFiles = historyFiles;

            if (searchText) {
                filteredFiles = filteredFiles.filter(item =>
                    (item.summary && item.summary.toLowerCase().includes(searchText)) ||
                    (item.id && item.id.toLowerCase().includes(searchText))
                );
            }

            if (dateFilter) {
                const filterDateStr = new Date(dateFilter).toDateString();
                filteredFiles = filteredFiles.filter(item =>
                    new Date(item.date).toDateString() === filterDateStr
                );
            }

            if (filteredFiles.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b;">No matches found.</div>';
                return;
            }

            // Group by Date
            const groups = {
                'Today': [],
                'Yesterday': [],
                'Previous 7 Days': [],
                'Older': []
            };

            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const last7Days = new Date(today);
            last7Days.setDate(last7Days.getDate() - 7);

            filteredFiles.forEach(item => {
                const itemDate = new Date(item.date);
                if (itemDate.toDateString() === today.toDateString()) {
                    groups['Today'].push(item);
                } else if (itemDate.toDateString() === yesterday.toDateString()) {
                    groups['Yesterday'].push(item);
                } else if (itemDate > last7Days) {
                    groups['Previous 7 Days'].push(item);
                } else {
                    groups['Older'].push(item);
                }
            });

            // Get checkbox state
            const historyFinalCheckbox = document.getElementById('history-final-checkbox');
            const showFinalOnly = historyFinalCheckbox ? historyFinalCheckbox.checked : false;

            // Render Groups
            let html = '';
            let groupIndex = 0;
            for (const [groupName, items] of Object.entries(groups)) {
                if (items.length > 0) {
                    const groupId = `history-group-${groupIndex++}`;
                    const isToday = groupName === 'Today';

                    html += `
                        <div class="history-group-container" style="margin-bottom: 5px;">
                            <h5 class="history-group-header" data-target="${groupId}" style="
                                margin: 10px 0 5px 0; 
                                color: var(--accent-color); 
                                font-size: 0.75rem; 
                                text-transform: uppercase; 
                                letter-spacing: 0.05em; 
                                cursor: pointer; 
                                display: flex; 
                                justify-content: space-between; 
                                align-items: center;
                                padding: 4px 8px;
                                background: rgba(255,255,255,0.03);
                                borderRadius: 4px;
                            ">
                                <span>${groupName}</span>
                                <span class="group-chevron" style="transition: transform 0.2s; font-size: 0.6rem;">▼</span>
                            </h5>
                            <div id="${groupId}" class="history-group-content" style="display: block; overflow: hidden; transition: all 0.3s ease;">
                                ${items.map(item => {
                        const messageCount = showFinalOnly ? (item.finalMessages || 0) : (item.totalMessages || 0);
                        const sessionId = item.id.includes('_') ? item.id.split('_')[1].substring(0, 6) : 'Unknown';
                        const dynamicSummary = `Session ${sessionId} - ${messageCount} msgs`;

                        return `
                                    <div class="history-item" data-id="${item.id}" style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; margin-bottom: 6px; transition: all 0.2s ease;">
                                        <div style="font-size: 0.8rem; font-weight: 600; color: #e2e8f0; display: flex; justify-content: space-between;">
                                            <span>${new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span style="font-size: 0.7rem; color: #64748b;">${new Date(item.date).toLocaleDateString()}</span>
                                        </div>
                                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${dynamicSummary}
                                        </div>
                                    </div>
                                `;
                    }).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            container.innerHTML = html;

            // Add Collapsible Listeners
            container.querySelectorAll('.history-group-header').forEach(header => {
                header.addEventListener('click', () => {
                    const targetId = header.getAttribute('data-target');
                    const content = document.getElementById(targetId);
                    const chevron = header.querySelector('.group-chevron');

                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        chevron.style.transform = 'rotate(0deg)';
                    } else {
                        content.style.display = 'none';
                        chevron.style.transform = 'rotate(-90deg)';
                    }
                });
            });

            // Add Click Listeners for Real items
            container.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => {
                    const filename = item.getAttribute('data-id');
                    this.loadHistorySession(filename);
                });
            });

        } catch (e) {
            console.error('Error fetching history:', e);
            container.innerHTML = '<div style="padding: 10px; color: #ef4444; font-size: 0.8rem;">Failed to load history.</div>';
        }
    }

    async loadHistorySession(filename) {
        if (!filename) return;

        try {
            const response = await fetch(`/api/history/${filename}`);
            if (!response.ok) throw new Error('Failed to load transcript');
            this.currentHistoryData = await response.json(); // Store for dynamic rendering

            if (!this.currentHistoryData.transcript || !Array.isArray(this.currentHistoryData.transcript)) {
                this.showToast('Invalid transcript format', 'error');
                return;
            }

            this.renderCurrentSession();
            this.showToast('Target session loaded', 'success');

        } catch (e) {
            console.error('Failed to load session:', e);
            this.showToast('Failed to load session history', 'error');
        }
    }

    renderCurrentSession() {
        if (!this.currentHistoryData) return;

        const data = this.currentHistoryData;

        // Get checkbox state for filtering messages
        const historyFinalCheckbox = document.getElementById('history-final-checkbox');
        const showFinalOnly = historyFinalCheckbox ? historyFinalCheckbox.checked : false;

        // Filter messages based on toggle state
        const messagesToShow = this.getFilteredMessages(data.transcript, showFinalOnly);

        // Clear current transcript
        this.transcriptEl.innerHTML = `
            <div style="padding: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px;">
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 4px;">VIEWING HISTORY ARCHIVE</div>
                <div style="font-weight: 600;">Session: ${data.sessionId}</div>
                <div style="font-size: 0.75rem; color: #64748b;">${new Date(data.startTime).toLocaleString()}</div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
                    Showing ${messagesToShow.length} of ${data.transcript.length} messages 
                    ${showFinalOnly ? '(Final Only)' : '(All)'}
                </div>
                ${data.tools && data.tools.length > 0 ? `
                    <div style="margin-top: 8px; font-size: 0.75rem; color: #94a3b8; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                        <strong>Loaded Tools:</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                            ${data.tools.map(t => `<span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 2px 6px; border-radius: 4px;">${t}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
                <button id="exit-history-btn" style="margin-top: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                    Return to Live Session
                </button>
            </div>
        `;

        // Render filtered messages
        messagesToShow.forEach(msg => {
            this.appendTranscriptMessage(msg);
        });

        // Add exit handler
        document.getElementById('exit-history-btn').addEventListener('click', () => {
            this.currentHistoryData = null; // Clear view state
            this.startNewSession(); // Simplest way to return to "live" state for now
        });
    }

    appendTranscriptMessage(roleOrMsg, textArg, timestampArg) {
        let role, text, timestamp, type;

        if (typeof roleOrMsg === 'object' && roleOrMsg !== null) {
            role = roleOrMsg.role;
            text = roleOrMsg.text;
            timestamp = roleOrMsg.timestamp;
            type = roleOrMsg.type;
        } else {
            role = roleOrMsg;
            text = textArg;
            timestamp = timestampArg;
        }

        const isSpeculative = type === 'speculative';
        const isTool = role === 'tool_use' || role === 'tool';
        const msgDiv = document.createElement('div');
        const isUser = role === 'user';

        if (isTool) {
            msgDiv.className = 'message tool-message';
            msgDiv.style.cssText = `
                margin-bottom: 12px;
                max-width: 90%;
                align-self: center;
                background: rgba(16, 185, 129, 0.05);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 8px;
                padding: 8px 12px;
                color: #34d399;
                font-size: 0.85rem;
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            const toolName = roleOrMsg.toolName || 'Tool';
            msgDiv.innerHTML = `
                <span style="font-size: 1rem;">🔧</span>
                <span style="font-family: monospace;">${text || `Executed: ${toolName}`}</span>
                <span style="margin-left: auto; font-size: 0.7rem; color: rgba(52, 211, 153, 0.6);">${new Date(timestamp).toLocaleTimeString()}</span>
            `;

            this.transcriptEl.appendChild(msgDiv);
            this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
            return;
        }

        msgDiv.className = `message ${isUser ? 'user-message' : 'agent-message'}`;
        msgDiv.style.cssText = `
            margin-bottom: 16px; 
            max-width: 80%; 
            align-self: ${isUser ? 'flex-end' : 'flex-start'};
            background: ${isUser ? 'rgba(59, 130, 246, 0.2)' : (isSpeculative ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)')};
            border: 1px ${isSpeculative ? 'dashed' : 'solid'} ${isUser ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)'};
            border-radius: 12px;
            padding: 12px 16px;
            color: ${isSpeculative ? '#94a3b8' : '#e2e8f0'};
            line-height: 1.5;
            font-style: ${isSpeculative ? 'italic' : 'normal'};
        `;

        if (!isUser) {
            msgDiv.style.marginRight = 'auto'; // Force left align
            msgDiv.style.marginLeft = '0';
        } else {
            msgDiv.style.marginLeft = 'auto'; // Force right align
            msgDiv.style.marginRight = '0';
        }

        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';


        msgDiv.innerHTML = `
            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 4px; display: flex; justify-content: space-between;">
                <span>${isUser ? 'You' : (isSpeculative ? '🤖 Assistant (Plan)' : '🤖 Assistant')}</span>
                <span>${timeStr}</span>
            </div>
            <div>${isUser ? this.parseMarkdown(text) : this.parseMarkdown(text)}</div>
        `;

        this.transcriptEl.appendChild(msgDiv);
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
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

        // Load default prompt from server
        this.loadDefaultPrompt();
        this.speechPromptInput.value = "";
        if (this.voiceSelect) this.voiceSelect.value = "matthew";
        if (this.brainModeSelect) this.brainModeSelect.value = "raw_nova";

        // Reset stats
        this.resetStats();

        // Save the reset settings
        this.saveSettings(false);

        // Disconnect if connected
        if (this.state !== 'disconnected') {
            this.disconnect();
        }

        this.log('Session reset. Ready to connect.', 'success');
        this.showToast('New session started', 'success');
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

    saveSettings(showToast = true) {
        localStorage.setItem('nova_system_prompt', this.systemPromptInput.value);
        localStorage.setItem('nova_speech_prompt', this.speechPromptInput.value);
        if (this.voiceSelect) {
            localStorage.setItem('nova_voice_id', this.voiceSelect.value);
        }
        if (this.brainModeSelect) { // New: Save brain mode
            localStorage.setItem('nova_brain_mode', this.brainModeSelect.value);
        }

        // Save Linked Workflows
        const linkedWorkflows = Array.from(document.querySelectorAll('#workflow-coupler-list input[type="checkbox"]:checked')).map(cb => cb.value);
        localStorage.setItem('nova_linked_workflows', JSON.stringify(linkedWorkflows));

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
        // const originalText = this.saveSettingsBtn.textContent;
        // this.saveSettingsBtn.textContent = 'Saved!';
        // this.saveSettingsBtn.style.background = '#d4edda';

        if (showToast) {
            this.showToast('Settings saved successfully', 'success');
        }

        // setTimeout(() => {
        //     this.saveSettingsBtn.textContent = originalText;
        //     this.saveSettingsBtn.style.background = '';
        // }, 2000);
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
        // If user selected the built-in "Banking Bot (Agent)" option, use default agent
        else if (brainMode === 'bedrock_agent') {
            // Use default agent configuration from server
            agentId = undefined; // Server will use default agent
            agentAliasId = undefined; // Server will use default agent
        } else if (brainMode === 'raw_nova') {
            // For Nova Sonic mode, we repurpose agentId to track the active Persona ID
            // helping the server load the correct workflow
            let foundPersonaId = null;

            // Check Persona Preset (main tab)
            if (this.presetSelect && this.presetSelect.selectedIndex > 0) {
                const selectedOption = this.presetSelect.options[this.presetSelect.selectedIndex];
                const dataId = selectedOption.getAttribute('data-id');
                if (dataId && dataId.startsWith('persona-')) {
                    foundPersonaId = dataId;
                }
            }

            // Fallback to Prompt Preset (prompts tab) if not found in main preset
            if (!foundPersonaId && this.promptPresetSelect && this.promptPresetSelect.selectedIndex > 0) {
                if (this.promptPresetSelect.value && this.promptPresetSelect.value.startsWith('persona-')) {
                    foundPersonaId = this.promptPresetSelect.value;
                }
            }

            if (foundPersonaId) {
                agentId = foundPersonaId.replace('.txt', '');
                console.log('[Frontend] Selected Persona ID (from Preset):', agentId);
            } else {
                // Fallback: Check if current system prompt matches any known persona content
                // This handles cases where the dropdown selection might not be visually updated yet
                // or if the user refreshed the page with a stored prompt
                const currentPrompt = this.systemPromptInput.value.trim();
                const options = this.presetSelect ? Array.from(this.presetSelect.options) : [];
                const matchingOption = options.find(opt => {
                    const dataId = opt.getAttribute('data-id');
                    // Check if content matches AND it's a persona file
                    // Note: option.value holds the content
                    return dataId && dataId.startsWith('persona-') && opt.value.trim() === currentPrompt;
                });

                if (matchingOption) {
                    const dataId = matchingOption.getAttribute('data-id');
                    agentId = dataId.replace('.txt', '');
                    console.log('[Frontend] Selected Persona ID (from Content Match):', agentId);
                }
            }
        }

        // Get selected tools
        const selectedTools = [];
        const toolCheckboxes = document.querySelectorAll('#tools-list input[type="checkbox"]:checked');
        toolCheckboxes.forEach(cb => {
            selectedTools.push(cb.value);
        });

        // Get linked workflows (Coupler)
        const linkedWorkflows = [];
        const wfCheckboxes = document.querySelectorAll('#workflow-coupler-list input[type="checkbox"]:checked');
        wfCheckboxes.forEach(cb => {
            linkedWorkflows.push(cb.value);
        });

        let finalSystemPrompt = '';

        // Prepend Core Guardrails (if loaded)
        if (this.corePrompt) {
            finalSystemPrompt += this.corePrompt + '\n\n';
        }

        // Add User/Persona Prompt
        finalSystemPrompt += this.systemPromptInput.value + '\n\n';

        // Voice Only Mode Optimization
        const currentInteractionMode = this.modeSelect ? this.modeSelect.value : 'chat_voice';
        if (currentInteractionMode === 'voice_only') {
            finalSystemPrompt += `
[CRITICAL MODE OVERRIDE: VOICE ONLY]
You are currently speaking to the user via audio-only interface. They CANNOT see your text.
1. Be extremely concise. Use short, simple sentences.
2. Do NOT use markdown, lists, or visual formatting.
3. Do NOT read long lists. Summarize or ask clarifying questions.
4. Focus on spoken clarity. Avoid complex numbers or codes unless essential.
`;
        } else {
            // Chat Only or Chat + Voice
            finalSystemPrompt += `
[CRITICAL MODE OVERRIDE: VISUAL INTERFACE ENABLED]
The user can see your response on a screen.
1. You may use Markdown formatting (bold, italics, lists) for better readability.
2. If providing resources, ALWAYS use fully formed Markdown links: [Link Text](https://example.com).
3. Do NOT omit URLs if they are helpful.
`;
        }

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

        // Retrieve stored AWS credentials to pass to the backend
        let awsCredentials = {};
        try {
            const stored = sessionStorage.getItem('aws_credentials');
            if (stored) {
                const parsed = JSON.parse(stored);
                awsCredentials = {
                    awsAccessKeyId: parsed.accessKeyId,
                    awsSecretAccessKey: parsed.secretAccessKey,
                    awsSessionToken: parsed.sessionToken,
                    awsRegion: parsed.region,
                    agentCoreRuntimeArn: parsed.agentCoreRuntimeArn
                };
            }
        } catch (e) {
            console.error('Failed to load AWS credentials for session config', e);
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
                selectedTools: selectedTools,
                linkedWorkflows: linkedWorkflows,
                enableGuardrails: document.getElementById('enable-guardrails')?.checked ?? true,
                // Pass AWS Credentials
                ...awsCredentials
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

            this.ws.onopen = async () => {
                this.log('Connected to server', 'success');
                this.updateState('connected');
                this.reconnectAttempts = 0; // Reset attempts
                this.showToast('Connected to server', 'success');

                this.addKeyMoment('connected', 'Session Connected', `Session ID: ${this.sessionId || 'Pending...'}`);

                // Start session timer
                this.startSessionTimer();
                this.startVisualizer();

                // Request prompts - Await to ensure presets are loaded before config is sent
                await this.loadPrompts();

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

                                // Update the moment we just added with real ID
                                const lastMoment = this.liveMomentsList?.querySelector('.moment-details');
                                if (lastMoment && lastMoment.textContent.includes('Pending')) {
                                    lastMoment.textContent = `Session ID: ${this.sessionId}`;
                                }

                                // Display version information
                                if (message.version) {
                                    this.updateVersionInfo(message.version);
                                }

                                if (this.debugContent) {
                                    const timestamp = new Date().toISOString();
                                    this.debugContent.innerHTML = `
                                        <div style="padding: 12px; border: 1px solid #4f46e5; border-radius: 6px; margin-bottom: 12px; background: rgba(79, 70, 229, 0.1);">
                                            <div style="color: #818cf8; font-weight: 600; margin-bottom: 6px;">🔌 Session Information</div>
                                            <div style="color: #c7d2fe; font-size: 0.9rem; font-family: 'JetBrains Mono', monospace;">
                                                <div><strong>Session ID:</strong> ${this.sessionId}</div>
                                                <div><strong>Connected:</strong> ${timestamp}</div>
                                                <div><strong>Status:</strong> Active</div>
                                                ${message.version ? `<div><strong>Version:</strong> ${message.version.version}</div>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }

                                // Check for missing credentials
                                if (message.hasCredentials === false) {
                                    // Check if we have them stored locally to send?
                                    const stored = sessionStorage.getItem('aws_credentials');
                                    if (!stored) {
                                        this.log('Missing AWS Credentials - Prompting user', 'warning');
                                        this.showToast('Please configure AWS Credentials', 'warning');
                                        if (this.awsModal) {
                                            this.awsModal.style.display = 'flex';
                                            // Focus the first field
                                            if (this.awsAccessKey) this.awsAccessKey.focus();
                                        }
                                    }
                                }
                                break;

                            case 'sessionStart':
                                this.log(`Session: ${message.sessionId} `, 'success');
                                break;

                            case 'transcript':
                                this.displayTranscript(message.role || 'assistant', message.text, message.isFinal, message.isStreaming);
                                this.log(`Transcript[${message.role}]: ${message.text} `);
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

                                        // Add to Key Moments
                                        this.addKeyMoment('tool', `Tool Used: ${toolName}`, JSON.stringify(message.data.toolUse.input, null, 2));

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
                                if (message.code === 'invalid_credentials') {
                                    this.showToast('Invalid AWS Credentials - Please check settings', 'error');
                                    this.log('Invalid AWS Credentials detected', 'error');
                                    if (this.awsModal) {
                                        this.awsModal.style.display = 'flex';
                                        if (this.awsAccessKey) this.awsAccessKey.focus();
                                    }
                                } else {
                                    this.showToast(message.message, 'error');
                                    this.addKeyMoment('error', 'Error Occurred', message.message);
                                }
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
        this.addKeyMoment('disconnected', 'Session Ended', 'User disconnected');

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
                console.log(`[Frontend] Sent ${this.chunkCount} audio chunks(${audioData.byteLength} bytes each)`);
            }
        } else {
            console.warn('[Frontend] WebSocket not open, cannot send audio');
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff max 10s

            this.log(`Attempting reconnect ${this.reconnectAttempts} / ${this.maxReconnectAttempts} in ${delay}ms...`);
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
        toast.className = `toast ${type} `;
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
        this.statusEl.className = `status ${newState} `;

        const stateLabels = {
            disconnected: 'Disconnected',
            connected: 'Connected',
            recording: 'Recording...'
        };

        this.statusEl.textContent = stateLabels[newState] || newState;

        // Update Sidebar Live Status
        if (this.liveStatusIndicator) {
            this.liveStatusIndicator.textContent = stateLabels[newState] || newState;
            // Remove all possible status classes
            this.liveStatusIndicator.classList.remove('disconnected', 'connected', 'recording');
            this.liveStatusIndicator.classList.add(newState);

            // Toggle header visibility based on connection
            if (this.liveMomentsHeader) {
                this.liveMomentsHeader.style.display = newState === 'connected' || newState === 'recording' ? 'block' : 'none';
            }

            // Clear list on new connection
            if (newState === 'connected' && this.liveMomentsList) {
                // Optional: clear list or keep history? Let's keep history for now but maybe mark a new session
            }
        }

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
     * Load version information from server
     */
    async loadVersionInfo() {
        try {
            const response = await fetch('/api/version');
            if (response.ok) {
                const versionData = await response.json();
                this.updateVersionInfo(versionData);
            } else {
                // Fallback to default display
                const versionEl = document.getElementById('version-info');
                if (versionEl) {
                    versionEl.textContent = 'Version unavailable';
                }
            }
        } catch (error) {
            console.warn('Failed to load version info:', error);
            const versionEl = document.getElementById('version-info');
            if (versionEl) {
                versionEl.textContent = 'Version unavailable';
            }
        }
    }

    /**
     * Update version information display
     */
    updateVersionInfo(versionData) {
        const versionEl = document.getElementById('version-info');
        if (versionEl && versionData) {
            const buildDate = new Date(versionData.buildTime);
            const formattedDate = buildDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            versionEl.textContent = `v${versionData.version} • Built: ${formattedDate} `;
        }
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
     * Helper function to parse basic markdown formatting
     */
    parseMarkdown(text) {
        if (!text) return '';

        // Escape HTML to prevent XSS
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        let escaped = escapeHtml(text);

        // Parse markdown formatting
        // Bold: **text**
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italics: *text* or _text_
        escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
        escaped = escaped.replace(/_(.+?)_/g, '<em>$1</em>');

        // Preserve line breaks
        escaped = escaped.replace(/\n/g, '<br>');

        return escaped;
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
            const textEl = lastMessage.querySelector('.text');
            if (isFinal) {
                textEl.innerHTML = this.parseMarkdown(text);
            } else {
                textEl.textContent = text;
            }
            lastMessage.classList.add('streaming');
            return;
        }

        // FINALIZE: Convert streaming message to final
        if (isFinal && (isTemporary || isStreamingMsg) && isSameRole) {
            const textEl = lastMessage.querySelector('.text');
            const lastText = textEl.textContent;
            // Only update if the text is different or longer
            if (text.length >= lastText.length) {
                textEl.innerHTML = this.parseMarkdown(text);
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

            // Header Row (Name + Time)
            const header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.75rem; opacity: 0.9;';

            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = '600';
            nameSpan.textContent = role === 'assistant' ? '🤖 Assistant' : 'You';

            const timeSpan = document.createElement('span');
            timeSpan.style.opacity = '0.7';
            const now = new Date();
            timeSpan.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            header.appendChild(nameSpan);
            header.appendChild(timeSpan);

            const textSpan = document.createElement('span');
            textSpan.className = 'text';
            // Use innerHTML with parsed markdown for final messages, textContent for streaming
            if (isFinal && !isStreaming) {
                textSpan.innerHTML = this.parseMarkdown(text);
            } else {
                textSpan.textContent = text;
            }

            entry.appendChild(header);
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
        console.log(`[${timestamp}][${type}] ${message} `);

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
            if (this.statDuration) this.statDuration.textContent = `${minutes}:${seconds} `;
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
                    ctx.fillStyle = `hsla(${hue}, 80 %, 60 %, 0.8)`;

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
                this.novaSonicModelId.value = awsCredentials.modelId || 'amazon.nova-2-sonic-v1:0';

                // Show placeholder text to indicate credentials are stored
                this.awsAccessKey.placeholder = 'Stored (enter new to update)';
                this.awsSecretKey.placeholder = 'Stored (enter new to update)';
                if (awsCredentials.sessionToken) {
                    this.awsSessionToken.placeholder = 'Stored (enter new to update)';
                }
            } catch (e) {
                console.error('[Frontend] Failed to parse stored AWS credentials:', e);
            }
        } else {
            // Reset placeholders if no credentials stored
            this.awsAccessKey.placeholder = 'AKIA...';
            this.awsSecretKey.placeholder = 'wJalrX...';
            this.awsSessionToken.placeholder = 'IQoJb3JpZ2luX2Vj...';
        }
    }

    /**
     * Save AWS Credentials locally for connection
     */
    async saveAwsCredentials() {
        const accessKeyId = this.awsAccessKey.value.trim();
        const secretAccessKey = this.awsSecretKey.value.trim();
        const sessionToken = this.awsSessionToken.value.trim();
        const region = this.awsRegion.value.trim() || 'us-east-1';
        const agentCoreRuntimeArn = this.agentCoreRuntimeArn.value.trim();
        const modelId = this.novaSonicModelId.value.trim();

        // Check if we have stored credentials to merge with
        const storedJson = sessionStorage.getItem('aws_credentials');
        let stored = null;
        if (storedJson) {
            try { stored = JSON.parse(storedJson); } catch (e) { }
        }

        // Logic: If fields are empty BUT we have stored creds, treat as "unchanged" (valid)
        // If fields are empty AND no stored creds, treat as "missing" (invalid)

        const isAccessKeyValid = !!accessKeyId || (stored && !!stored.accessKeyId);
        const isSecretKeyValid = !!secretAccessKey || (stored && !!stored.secretAccessKey);

        // Reset visual errors
        this.awsAccessKey.style.borderColor = '';
        this.awsSecretKey.style.borderColor = '';

        if (!isAccessKeyValid || !isSecretKeyValid) {
            this.showToast('Please enter both Access Key and Secret Key', 'error');
            if (!isAccessKeyValid) this.awsAccessKey.style.borderColor = '#ef4444';
            if (!isSecretKeyValid) this.awsSecretKey.style.borderColor = '#ef4444';
            return;
        }

        // Construct new credentials object
        // Use new value if provided, else fallback to stored
        const newCredentials = {
            accessKeyId: accessKeyId || (stored ? stored.accessKeyId : ''),
            secretAccessKey: secretAccessKey || (stored ? stored.secretAccessKey : ''),
            sessionToken: sessionToken || (stored ? stored.sessionToken : ''),
            region: region,
            agentCoreRuntimeArn: agentCoreRuntimeArn,
            modelId: modelId
        };

        // Store credentials in sessionStorage
        sessionStorage.setItem('aws_credentials', JSON.stringify(newCredentials));

        // Send to server if connected
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const awsConfig = {
                type: 'awsConfig',
                config: newCredentials
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
        this.awsSessionToken.value = '';

        // Update placeholders to show they are stored
        this.awsAccessKey.placeholder = 'Stored (enter new to update)';
        this.awsSecretKey.placeholder = 'Stored (enter new to update)';
        this.awsSessionToken.placeholder = 'Stored (enter new to update)';
    }

    /**
     * Clear stored AWS credentials
     */
    clearStoredAwsCredentials() {
        this.deleteConfirmText.textContent = 'Are you sure you want to clear stored AWS credentials?';
        this.pendingConfirmAction = () => {
            sessionStorage.removeItem('aws_credentials');
            this.showToast('AWS Credentials Cleared', 'info');
            this.log('Cleared stored AWS credentials');

            // Reset form
            this.awsAccessKey.value = '';
            this.awsSecretKey.value = '';
            this.awsSessionToken.value = '';
            this.awsRegion.value = 'us-east-1';
            this.agentCoreRuntimeArn.value = '';
            this.novaSonicModelId.value = 'amazon.nova-2-sonic-v1:0';
            this.awsAccessKey.placeholder = 'AKIA...';
            this.awsSecretKey.placeholder = 'wJalrX...';
            this.awsSessionToken.placeholder = 'IQoJb3JpZ2luX2Vj...';

            this.awsModal.style.display = 'none';
        };
        this.deleteConfirmModal.style.display = 'flex';
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
        this.deleteConfirmText.textContent = `Are you sure you want to delete agent "${agentName}" ? `;
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
                latencyEl.textContent = lat !== '--' ? `${lat} ms` : lat;
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
                const corePromptObj = allPrompts.find(p => p.id === 'core-guardrails.txt');
                if (corePromptObj) {
                    this.corePrompt = corePromptObj.content;
                    console.log('[Frontend] Loaded Core Guardrails');
                }

                // Filter prompts for UI - show all prompts in dropdown but filter personas for preset selector
                const visiblePrompts = allPrompts;

                this.updatePromptDropdown(visiblePrompts);
                this.initializePresets(visiblePrompts);
            } else {
                console.error('[Frontend] Failed to fetch prompts:', response.status);
            }
        } catch (err) {
            console.error('[Frontend] Error fetching prompts:', err);
        }
    }

    async loadDefaultPrompt() {
        try {
            const response = await fetch('/api/prompts');
            if (response.ok) {
                const prompts = await response.json();
                const defaultPrompt = prompts.find(p => p.id === 'core-system_default.txt');
                if (defaultPrompt) {
                    this.systemPromptInput.value = defaultPrompt.content;
                } else {
                    // Fallback if prompt file doesn't exist
                    this.systemPromptInput.value = "You are a helpful AI assistant.";
                }
            }
        } catch (err) {
            console.error('[Frontend] Error loading default prompt:', err);
            this.systemPromptInput.value = "You are a helpful AI assistant.";
        }
    }

    updatePromptDropdown(prompts) {
        if (!this.promptPresetSelect) return;
        this.promptPresetSelect.innerHTML = '<option value="">Custom / Select Preset...</option>';

        // Group prompts by category
        const corePrompts = prompts.filter(p => p.id.startsWith('core-'));
        const personaPrompts = prompts.filter(p => p.id.startsWith('persona-'));
        const otherPrompts = prompts.filter(p => !p.id.startsWith('core-') && !p.id.startsWith('persona-'));

        // Helper function to create option with source indicator
        const createOption = (prompt) => {
            const option = document.createElement('option');
            option.value = prompt.id;
            // Add source indicator: 🟢 for Langfuse, ⚪ for local
            const indicator = prompt.source === 'langfuse' ? '🟢' : '⚪';
            option.textContent = `${indicator} ${prompt.name.replace('Core ', '').replace('Persona ', '')}`;
            option.setAttribute('data-content', prompt.content);
            option.setAttribute('data-source', prompt.source);
            return option;
        };

        // Add Core prompts group
        if (corePrompts.length > 0) {
            const coreGroup = document.createElement('optgroup');
            coreGroup.label = 'Core Platform';
            corePrompts.forEach(prompt => {
                coreGroup.appendChild(createOption(prompt));
            });
            this.promptPresetSelect.appendChild(coreGroup);
        }

        // Add Persona prompts group
        if (personaPrompts.length > 0) {
            const personaGroup = document.createElement('optgroup');
            personaGroup.label = 'Personas';
            personaPrompts.forEach(prompt => {
                personaGroup.appendChild(createOption(prompt));
            });
            this.promptPresetSelect.appendChild(personaGroup);
        }

        // Add other prompts if any
        if (otherPrompts.length > 0) {
            const otherGroup = document.createElement('optgroup');
            otherGroup.label = 'Other';
            otherPrompts.forEach(prompt => {
                otherGroup.appendChild(createOption(prompt));
            });
            this.promptPresetSelect.appendChild(otherGroup);
        }
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

                    // Categorization Logic
                    const categories = {
                        'Banking': [],
                        'Mortgage': [],
                        'System': [],
                        'Other': []
                    };

                    tools.forEach(tool => {
                        // Read category from metadata, default to 'Other'
                        let cat = tool.category || 'Other';

                        // Normalize known categories (case-sensitive matching in our UI keys)
                        if (['Banking', 'Mortgage', 'System'].includes(cat)) {
                            // Perfect match
                        } else {
                            // If it's a new category not in our master list, maybe add it dynamically?
                            // For now, let's treat unknown categories as keys too!
                            if (!categories[cat]) {
                                categories[cat] = [];
                            }
                        }

                        if (categories[cat]) {
                            categories[cat].push(tool);
                        } else {
                            // Fallback
                            categories['Other'].push(tool);
                        }
                    });

                    // --- Tab Bar ---
                    const tabContainer = document.createElement('div');
                    tabContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; overflow-x: auto;';

                    const activeTabStyle = 'background: rgba(139, 92, 246, 0.3); border: 1px solid rgba(139, 92, 246, 0.5); color: white;';
                    const inactiveTabStyle = 'background: transparent; border: 1px solid transparent; color: #94a3b8; hover:text-white;';
                    const baseTabStyle = 'padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; white-space: nowrap;';

                    let activeCategory = 'Banking'; // Default

                    // Create Tabs
                    Object.keys(categories).forEach(cat => {
                        if (categories[cat].length === 0) return;

                        const btn = document.createElement('button');
                        btn.textContent = cat;
                        btn.id = `tab-btn-${cat}`;
                        btn.style.cssText = baseTabStyle + (cat === activeCategory ? activeTabStyle : inactiveTabStyle);

                        btn.addEventListener('click', () => {
                            // Update Tabs
                            document.querySelectorAll('[id^="tab-btn-"]').forEach(b => {
                                b.style.cssText = baseTabStyle + inactiveTabStyle;
                            });
                            btn.style.cssText = baseTabStyle + activeTabStyle;

                            // Update Content
                            document.querySelectorAll('[id^="cat-content-"]').forEach(c => {
                                c.style.display = 'none';
                            });
                            const content = document.getElementById(`cat-content-${cat}`);
                            if (content) content.style.display = 'flex';
                        });

                        tabContainer.appendChild(btn);
                    });
                    container.appendChild(tabContainer);

                    // --- Content Areas ---
                    Object.entries(categories).forEach(([category, categoryTools]) => {
                        if (categoryTools.length === 0) return;

                        const catContent = document.createElement('div');
                        catContent.id = `cat-content-${category}`;
                        catContent.style.cssText = `display: ${category === activeCategory ? 'flex' : 'none'}; flex-direction: column; gap: 8px;`;

                        categoryTools.forEach(tool => {
                            const div = document.createElement('div');
                            div.style.display = 'flex';
                            div.style.alignItems = 'center';
                            div.style.gap = '8px';
                            div.style.marginBottom = '4px';

                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.id = `tool-${tool.name}`;
                            checkbox.value = tool.name;
                            checkbox.checked = true; // Default to checked

                            const label = document.createElement('label');
                            label.htmlFor = `tool-${tool.name}`;
                            label.style.fontSize = '0.9rem';
                            label.style.cursor = 'pointer';
                            label.style.color = '#e2e8f0';
                            label.textContent = tool.name;
                            label.title = tool.description || '';

                            div.appendChild(checkbox);
                            div.appendChild(label);
                            catContent.appendChild(div);
                        });

                        container.appendChild(catContent);
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load tools:', e);
            const container = document.getElementById('tools-list');
            if (container) container.innerHTML = '<div style="color: #ef4444; font-size: 0.8rem;">Failed to load tools</div>';
        }
    }
    async loadWorkflows() {
        try {
            console.log('[Frontend] Fetching workflows...');
            const response = await fetch('/api/workflows');
            if (response.ok) {
                const workflows = await response.json();
                const container = document.getElementById('workflow-coupler-list');

                if (container) {
                    container.innerHTML = '';

                    if (workflows.length === 0) {
                        container.innerHTML = '<div style="font-size: 0.8rem; color: #64748b; font-style: italic;">No additional workflows found.</div>';
                        return;
                    }

                    workflows.forEach(wf => {
                        const div = document.createElement('div');
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.gap = '8px';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `wf-${wf.id}`;
                        checkbox.value = wf.id;
                        checkbox.name = 'linkedWorkflow';
                        checkbox.style.cursor = 'pointer';
                        checkbox.addEventListener('change', () => this.saveSettings());

                        const label = document.createElement('label');
                        label.htmlFor = `wf-${wf.id}`;
                        label.style.fontSize = '0.9rem';
                        label.style.color = '#e2e8f0';
                        label.style.cursor = 'pointer';

                        // Use the pre-formatted name from the API
                        label.textContent = wf.name;

                        div.appendChild(checkbox);
                        div.appendChild(label);
                        container.appendChild(div);
                    });

                    // Trigger auto-select to ensure defaults are checked
                    this.autoSelectWorkflowForPersona();

                    // Restore user overrides from persistence
                    this.restoreLinkedWorkflows();
                }

            } else {
                console.error('[Frontend] Failed to fetch workflows:', response.status);
            }
        } catch (e) {
            console.error('Failed to load workflows:', e);
            const container = document.getElementById('workflow-coupler-list');
            if (container) container.innerHTML = '<div style="color: #ef4444; font-size: 0.8rem;">Failed to load workflows</div>';
        }
    }


    autoSelectWorkflowForPersona() {
        const brainMode = this.brainModeSelect ? this.brainModeSelect.value : null;

        // Uncheck all first
        const checkboxes = document.querySelectorAll('input[name="linkedWorkflow"]');
        checkboxes.forEach(cb => cb.checked = false);

        let targetId = null;

        // 1. Check Brain Mode (Bot vs Agent) first
        if (brainMode === 'bedrock_agent') {
            targetId = 'banking';
        }

        // 2. If no target yet (likely 'raw_nova'), check the Persona Preset
        if (!targetId && this.presetSelect) {
            const selectedOption = this.presetSelect.options[this.presetSelect.selectedIndex];
            if (selectedOption) {
                const personaId = selectedOption.getAttribute('data-id');
                // personaId example: 'core-persona-mortgage.txt'
                if (personaId) {
                    // Clean it up: Remove 'core-' and '.txt'
                    // core-persona-mortgage.txt -> persona-mortgage
                    targetId = personaId.replace('core-', '').replace('.txt', '');

                    // Explicit Mapping
                    if (targetId === 'persona-BankingDisputes') {
                        targetId = 'banking';
                    }
                }
            }
        }

        if (targetId) {
            const targetCheckbox = document.getElementById(`wf-${targetId}`);
            if (targetCheckbox) {
                targetCheckbox.checked = true;
            }
        }
    }

    restoreLinkedWorkflows() {
        const saved = localStorage.getItem('nova_linked_workflows');
        if (saved) {
            try {
                const ids = JSON.parse(saved);
                if (Array.isArray(ids)) {
                    const checkboxes = document.querySelectorAll('#workflow-coupler-list input[type="checkbox"]');
                    checkboxes.forEach(cb => {
                        cb.checked = ids.includes(cb.value);
                    });
                    console.log('[Frontend] Restored linked workflows:', ids);
                }
            } catch (e) {
                console.error('Failed to restore workflows:', e);
            }
        }
    }

    async loadKnowledgeBases() {
        if (!this.kbList) return;
        try {
            const response = await fetch('/api/knowledge-bases');
            if (response.ok) {
                const kbs = await response.json();
                this.kbList.innerHTML = '';
                if (kbs.length === 0) {
                    this.kbList.innerHTML = '<div style="font-size: 0.8rem; color: #64748b; font-style: italic;">No Knowledge Bases configured.</div>';
                } else {
                    kbs.forEach(kb => {
                        const item = document.createElement('div');
                        item.style.cssText = 'padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;';
                        item.innerHTML = `
    <div>
                                <div style="font-weight: 600; color: #e2e8f0; font-size: 0.9rem;">${kb.name}</div>
                                <div style="font-size: 0.75rem; color: #94a3b8; font-family: monospace;">${kb.id}</div>
                                <div style="font-size: 0.7rem; color: #64748b;">${kb.modelName || 'Unknown Model'}</div>
                            </div>
    <div style="display: flex; gap: 5px;">
        <button class="icon-btn edit-kb-btn" data-id="${kb.id}" data-name="${kb.name}" data-model="${kb.modelArn || ''}" style="color: #6366f1; opacity: 0.7;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="icon-btn delete-kb-btn" data-id="${kb.id}" style="color: #ef4444; opacity: 0.7;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    </div>
`;
                        this.kbList.appendChild(item);
                    });

                    // Add edit listeners
                    const editBtns = this.kbList.querySelectorAll('.edit-kb-btn');
                    editBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const id = btn.getAttribute('data-id');
                            const name = btn.getAttribute('data-name');
                            const model = btn.getAttribute('data-model');
                            this.editKnowledgeBase(id, name, model);
                        });
                    });

                    // Add delete listeners
                    const deleteBtns = this.kbList.querySelectorAll('.delete-kb-btn');
                    deleteBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const id = btn.getAttribute('data-id');
                            this.pendingKbDeleteId = id;
                            this.deleteConfirmText.textContent = `Are you sure you want to delete KB "${id}" ? `;
                            this.deleteConfirmModal.style.display = 'flex';
                        });
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load KBs:', e);
            this.kbList.innerHTML = '<div style="color: #ef4444; font-size: 0.8rem;">Failed to load KBs.</div>';
        }
    }

    async loadBedrockModels() {
        console.log('[Frontend] loadBedrockModels called');
        if (!this.newKbModel) {
            console.error('[Frontend] newKbModel element not found');
            return;
        }
        try {
            console.log('[Frontend] Fetching /api/bedrock-models');
            const response = await fetch('/api/bedrock-models');
            console.log('[Frontend] Response status:', response.status);
            if (response.ok) {
                const models = await response.json();
                this.newKbModel.innerHTML = '<option value="">Select a model...</option>';
                models.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.arn || m.id;
                    option.textContent = `${m.name} (${m.provider})`; // e.g. "Nova 2 Lite (Amazon)"
                    option.setAttribute('data-name', m.name);
                    this.newKbModel.appendChild(option);
                });
            }
        } catch (e) {
            console.error('Failed to load models:', e);
            this.newKbModel.innerHTML = '<option value="">Error loading models</option>';
        }
    }

    async addKnowledgeBase() {
        const name = this.newKbName.value.trim();
        const id = this.newKbId.value.trim();
        const modelArn = this.newKbModel.value;
        const modelName = this.newKbModel.options[this.newKbModel.selectedIndex]?.getAttribute('data-name');

        if (!name || !id || !modelArn) {
            this.showToast('Please fill all fields', 'warning');
            return;
        }

        try {
            let response;
            if (this.editingKbId) {
                // Update Mode
                response = await fetch(`/api/knowledge-bases/${this.editingKbId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, id, modelArn, modelName })
                });
            } else {
                // Create Mode
                response = await fetch('/api/knowledge-bases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, id, modelArn, modelName })
                });
            }

            if (response.ok) {
                this.showToast(this.editingKbId ? 'Knowledge Base updated' : 'Knowledge Base added', 'success');
                this.newKbName.value = '';
                this.newKbId.value = '';
                this.newKbModel.value = '';
                this.editingKbId = null;
                this.addKbBtn.textContent = 'Add Knowledge Base'; // Restore button text

                this.loadKnowledgeBases();
            } else {
                throw new Error('Failed to save KB');
            }
        } catch (e) {
            console.error('Failed to save KB:', e);
            this.showToast('Error saving Knowledge Base', 'error');
        }
    }

    editKnowledgeBase(id, name, modelArn) {
        this.editingKbId = id;
        this.newKbName.value = name;
        this.newKbId.value = id;
        this.newKbModel.value = modelArn;

        // Update Button Text
        if (this.addKbBtn) {
            this.addKbBtn.textContent = 'Update Knowledge Base';
        }

        // Focus on name field
        this.newKbName.focus();
    }

    async deleteKnowledgeBase(id) {
        try {
            const response = await fetch(`/api/knowledge-bases/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showToast('Knowledge Base deleted', 'info');
                this.loadKnowledgeBases();
            } else {
                throw new Error('Failed to delete');
            }
        } catch (e) {
            console.error('Failed to delete KB:', e);
            this.showToast('Error deleting KB', 'error');
        }
    }
}

// Initialize application when DOM is ready


// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAssistant();
    window.app.loadPrompts(); // Load prompts immediately
    window.app.loadVersionInfo(); // Load version info immediately
});

// Clean up on page unload


// Global window event listeners
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.disconnect();
    }
});

