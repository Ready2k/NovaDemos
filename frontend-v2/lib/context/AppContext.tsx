'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type {
    Message,
    Session,
    AppSettings,
    Tool,
    Workflow,
    KnowledgeBase,
    ConnectionStatus,
    KeyMoment,
} from '@/lib/types';


export interface SbcMessage {
    role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
    text: string;
    toolName?: string;
    args?: any;
    timestamp: number;
}

export interface SbcCall {
    callId:     string;
    from:       string;
    voice:      string;
    persona:    string;
    workflow:   string;
    startTime:  number;
    endTime?:   number;
    durationMs?: number;
    messages:   SbcMessage[];
    status:     'active' | 'ended';
}

interface AppState {
    // Connection
    connectionStatus: ConnectionStatus;
    setConnectionStatus: (status: ConnectionStatus) => void;

    // Session
    currentSession: Session | null;
    setCurrentSession: (session: Session | null) => void;
    updateSessionStats: (stats: Partial<Session>) => void;

    // Messages
    messages: Message[];
    addMessage: (message: Message) => void;
    updateLastMessage: (updates: Partial<Message>) => void;
    clearMessages: () => void;

    // Settings
    settings: AppSettings;
    updateSettings: (updates: Partial<AppSettings>) => void;

    // Tools
    tools: Tool[];
    setTools: (tools: Tool[]) => void;
    toggleTool: (toolName: string) => void;

    // Workflows
    workflows: Workflow[];
    setWorkflows: (workflows: Workflow[]) => void;
    toggleWorkflow: (workflowId: string) => void;
    // Current live workflow execution state
    workflowState: { currentStep: string; stepId?: string; status: 'active' | 'completed' | 'idle' } | null;
    setWorkflowState: (state: { currentStep: string; stepId?: string; status: 'active' | 'completed' | 'idle' } | null) => void;

    // Knowledge Bases
    knowledgeBases: KnowledgeBase[];
    setKnowledgeBases: (kbs: KnowledgeBase[]) => void;
    addKnowledgeBase: (kb: KnowledgeBase) => void;
    removeKnowledgeBase: (kbId: string) => void;

    // Key Moments
    keyMoments: KeyMoment[];
    addKeyMoment: (moment: Omit<KeyMoment, 'id' | 'timestamp'>) => void;
    clearKeyMoments: () => void;

    // UI State
    isDarkMode: boolean;
    setIsDarkMode: (dark: boolean) => void;
    debugMode: boolean;
    setDebugMode: (debug: boolean) => void;
    isHydrated: boolean;

    // Navigation (Phase 3)
    activeView: 'chat' | 'settings' | 'workflow' | 'history' | 'phone';
    navigateTo: (view: 'chat' | 'settings' | 'workflow' | 'history' | 'phone') => void;
    activeSettingsTab: string;
    setActiveSettingsTab: (tab: string) => void;
    resetSession: () => void;
    isAboutModalOpen: boolean;
    setIsAboutModalOpen: (open: boolean) => void;

    // Toast (Phase 3)
    toast: { message: string, type: 'success' | 'error' | 'info' | null };
    showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;

    // SBC Phone calls
    sbcCalls: SbcCall[];
    addSbcEvent: (event: any) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Default settings
const defaultSettings: AppSettings = {
    interactionMode: 'chat_voice',
    brainMode: 'raw_nova',
    voicePreset: 'matthew',
    personaPreset: '',
    agentId: '',
    agentAliasId: '',
    enableGuardrails: true,
    systemPrompt: 'You are a warm, professional, and helpful AI assistant. Give accurate answers that sound natural, direct, and human. Start by answering the user\'s question clearly in 1–2 sentences. Then, expand only enough to make the answer understandable, staying within 3–5 short sentences total. Avoid sounding like a lecture or essay.',
    speechPrompt: '',
    enabledTools: [],
    knowledgeBases: [],
    costConfig: {
        nova: {
            inputCost: 0.003,
            outputCost: 0.015,
        },
        agent: {
            inputCost: 0.003,
            outputCost: 0.015,
        },
    },
    showWorkflowVisualization: true,
    linkedWorkflows: [],
    debugMode: false,
    visualizationStyle: 'simple_wave',
    physicsSpeed: 0.5,
    physicsSensitivity: 1.0,
    contextGrowth: 0,
};

export function AppProvider({ children }: { children: ReactNode }) {
    // Connection state
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

    // Session state
    const [currentSession, setCurrentSessionState] = useState<Session | null>(null);
    const setCurrentSession = useCallback((value: Session | null | ((prev: Session | null) => Session | null)) => {
        setCurrentSessionState(prev => {
            const next = typeof value === 'function' ? (value as any)(prev) : value;
            console.log('[AppContext] Setting current session:', next?.sessionId || 'null');
            return next;
        });
    }, []);

    // Messages state
    const [messages, setMessages] = useState<Message[]>([]);

    // Hydration state
    const [isHydrated, setIsHydrated] = useState(false);

    // About Modal state
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

    // Settings state
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);

    // Hydrate settings from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('nova_settings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Ensure simulation mode is OFF on reload
                    parsed.simulationMode = false;
                    setSettings(prev => ({ ...prev, ...parsed }));
                } catch (e) {
                    console.error('Failed to parse settings', e);
                }
            }
            setIsHydrated(true);
        }
    }, []);

    // Save settings to localStorage whenever they change (only after initial hydration)
    useEffect(() => {
        if (isHydrated && typeof window !== 'undefined') {
            localStorage.setItem('nova_settings', JSON.stringify(settings));
        }
    }, [settings, isHydrated]);

    // Tools state
    const [tools, setTools] = useState<Tool[]>([]);

    // Workflows state
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [workflowState, setWorkflowState] = useState<{ currentStep: string; stepId?: string; status: 'active' | 'completed' | 'idle' } | null>(null);

    // Knowledge bases state
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

    // Key moments state
    const [keyMoments, setKeyMoments] = useState<KeyMoment[]>([]);

    // Toast state
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' | null }>({
        message: '',
        type: null
    });

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info', duration = 3000) => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(prev => prev.message === message ? { message: '', type: null } : prev);
        }, duration);
    }, []);

    // UI state


    // Session actions
    const updateSessionStats = useCallback((stats: Partial<Session>) => {
        setCurrentSession(prev => {
            return prev ? { ...prev, ...stats } : null;
        });
    }, []);

    // Message actions
    const addMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message]);

        // Also add to current session transcript
        if (currentSession) {
            setCurrentSession(prev => prev ? {
                ...prev,
                transcript: [...prev.transcript, message],
            } : null);
        }
    }, [currentSession]);

    const updateLastMessage = useCallback((updates: Partial<Message>) => {
        setMessages(prev => {
            if (prev.length === 0) return prev;
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], ...updates };
            return newMessages;
        });

        // Also update in session transcript
        if (currentSession) {
            setCurrentSession(prev => {
                if (!prev || prev.transcript.length === 0) return prev;
                const newTranscript = [...prev.transcript];
                newTranscript[newTranscript.length - 1] = { ...newTranscript[newTranscript.length - 1], ...updates };
                return { ...prev, transcript: newTranscript };
            });
        }
    }, [currentSession]);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    // Settings actions
    const updateSettings = useCallback((updates: Partial<AppSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    }, []);

    // Tool actions
    const toggleTool = useCallback((toolName: string) => {
        setTools(prev => prev.map(tool =>
            tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool
        ));
    }, []);

    // Workflow actions
    const toggleWorkflow = useCallback((workflowId: string) => {
        setWorkflows(prev => prev.map(workflow =>
            workflow.id === workflowId ? { ...workflow, linked: !workflow.linked } : workflow
        ));
    }, []);

    // Knowledge base actions
    const addKnowledgeBase = useCallback((kb: KnowledgeBase) => {
        setKnowledgeBases(prev => [...prev, kb]);
    }, []);

    const removeKnowledgeBase = useCallback((kbId: string) => {
        setKnowledgeBases(prev => prev.filter(kb => kb.id !== kbId));
    }, []);

    // Key moment actions
    const addKeyMoment = useCallback((moment: Omit<KeyMoment, 'id' | 'timestamp'>) => {
        const newMoment: KeyMoment = {
            ...moment,
            id: `moment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
        };
        setKeyMoments(prev => [...prev, newMoment]);
    }, []);

    const clearKeyMoments = useCallback(() => {
        setKeyMoments([]);
    }, []);

    // SBC phone calls state (keep last 20 calls)
    const [sbcCalls, setSbcCalls] = useState<SbcCall[]>([]);

    // Auto-connect to /monitor WebSocket on mount — independent of Nova Sonic session
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/monitor`;
        let ws: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            ws = new WebSocket(url);
            ws.onopen = () => console.log('[Monitor] Connected to /monitor');
            ws.onmessage = (e) => {
                try {
                    const event = JSON.parse(e.data);
                    if (event.type === 'sbc_snapshot') {
                        // Replay each active call as a sbc_call_start so the panel builds state
                        (event.calls as any[]).forEach(c => {
                            setSbcCalls(prev => {
                                if (prev.some(x => x.callId === c.callId)) return prev;
                                const newCall: SbcCall = {
                                    callId:   c.callId,
                                    from:     c.from || 'Unknown',
                                    voice:    c.voice || 'amy',
                                    persona:  c.persona || 'BankingDisputes',
                                    workflow: c.workflow || 'disputes',
                                    startTime: c.startTime || Date.now(),
                                    messages:  [],
                                    status:    'active',
                                };
                                return [newCall, ...prev].slice(0, 20);
                            });
                        });
                    } else {
                        setSbcCalls(prev => {
                            // Reuse addSbcEvent logic inline so we don't need the callback ref
                            switch (event.type) {
                                case 'sbc_call_start': {
                                    if (prev.some(c => c.callId === event.callId)) return prev;
                                    const newCall: SbcCall = {
                                        callId:    event.callId,
                                        from:      event.from || 'Unknown',
                                        voice:     event.voice || 'amy',
                                        persona:   event.persona || 'BankingDisputes',
                                        workflow:  event.workflow || 'disputes',
                                        startTime: Date.now(),
                                        messages:  [],
                                        status:    'active',
                                    };
                                    return [newCall, ...prev].slice(0, 20);
                                }
                                case 'sbc_transcript':
                                    return prev.map(call => call.callId !== event.callId ? call : {
                                        ...call,
                                        messages: [...call.messages, {
                                            role: event.role === 'assistant' ? 'assistant' : 'user',
                                            text: event.text || '',
                                            timestamp: Date.now(),
                                        } as SbcMessage],
                                    });
                                case 'sbc_tool_use':
                                    return prev.map(call => call.callId !== event.callId ? call : {
                                        ...call,
                                        messages: [...call.messages, {
                                            role: 'tool_use',
                                            text: event.toolName || '',
                                            toolName: event.toolName,
                                            args: event.args,
                                            timestamp: Date.now(),
                                        } as SbcMessage],
                                    });
                                case 'sbc_tool_result':
                                    return prev.map(call => call.callId !== event.callId ? call : {
                                        ...call,
                                        messages: [...call.messages, {
                                            role: 'tool_result',
                                            text: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
                                            toolName: event.toolName,
                                            timestamp: Date.now(),
                                        } as SbcMessage],
                                    });
                                case 'sbc_call_end':
                                    return prev.map(call => call.callId !== event.callId ? call : {
                                        ...call,
                                        status: 'ended',
                                        endTime: Date.now(),
                                        durationMs: event.durationMs,
                                    });
                                default:
                                    return prev;
                            }
                        });
                    }
                } catch { /* ignore parse errors */ }
            };
            ws.onclose = () => {
                console.log('[Monitor] Disconnected — retrying in 5s');
                retryTimer = setTimeout(connect, 5000);
            };
            ws.onerror = () => ws?.close();
        };

        connect();

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            ws?.close();
        };
    }, []);

    const addSbcEvent = useCallback((event: any) => {
        setSbcCalls(prev => {
            switch (event.type) {
                case 'sbc_call_start': {
                    const newCall: SbcCall = {
                        callId:   event.callId,
                        from:     event.from || 'Unknown',
                        voice:    event.voice || 'amy',
                        persona:  event.persona || 'BankingDisputes',
                        workflow: event.workflow || 'disputes',
                        startTime: Date.now(),
                        messages:  [],
                        status:    'active',
                    };
                    return [newCall, ...prev].slice(0, 20);
                }
                case 'sbc_transcript': {
                    return prev.map(call => {
                        if (call.callId !== event.callId) return call;
                        return {
                            ...call,
                            messages: [...call.messages, {
                                role:      event.role === 'assistant' ? 'assistant' : 'user',
                                text:      event.text || '',
                                timestamp: Date.now(),
                            } as SbcMessage],
                        };
                    });
                }
                case 'sbc_tool_use': {
                    return prev.map(call => {
                        if (call.callId !== event.callId) return call;
                        return {
                            ...call,
                            messages: [...call.messages, {
                                role:      'tool_use',
                                text:      event.toolName || '',
                                toolName:  event.toolName,
                                args:      event.args,
                                timestamp: Date.now(),
                            } as SbcMessage],
                        };
                    });
                }
                case 'sbc_tool_result': {
                    return prev.map(call => {
                        if (call.callId !== event.callId) return call;
                        return {
                            ...call,
                            messages: [...call.messages, {
                                role:      'tool_result',
                                text:      typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
                                toolName:  event.toolName,
                                timestamp: Date.now(),
                            } as SbcMessage],
                        };
                    });
                }
                case 'sbc_call_end': {
                    return prev.map(call => {
                        if (call.callId !== event.callId) return call;
                        return {
                            ...call,
                            status:     'ended',
                            endTime:    Date.now(),
                            durationMs: event.durationMs,
                        };
                    });
                }
                default:
                    return prev;
            }
        });
    }, []);

    // UI state
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [debugMode, setDebugMode] = useState(false);

    // Navigation State (Phase 3)
    const [activeView, setActiveView] = useState<'chat' | 'settings' | 'workflow' | 'history' | 'phone'>('chat');
    const [activeSettingsTab, setActiveSettingsTab] = useState('general');

    const navigateTo = useCallback((view: 'chat' | 'settings' | 'workflow' | 'history' | 'phone') => {
        setActiveView(view);
    }, []);

    const resetSession = useCallback(() => {
        clearMessages();
        setCurrentSession(null);
        // Optionally generate a new session ID if we want to force it immediately,
        // but typically the backend handles session start. We just clear local state.
        console.log('[App] Session reset.');
    }, [clearMessages]);

    const value: AppState = {
        // Connection
        connectionStatus,
        setConnectionStatus,

        // Session
        currentSession,
        setCurrentSession,
        updateSessionStats,
        resetSession,

        // Messages
        messages,
        addMessage,
        updateLastMessage,
        clearMessages,

        // Settings
        settings,
        updateSettings,

        // Tools
        tools,
        setTools,
        toggleTool,

        // Workflows
        workflows,
        setWorkflows,
        toggleWorkflow,
        workflowState,
        setWorkflowState,

        // Knowledge Bases
        knowledgeBases,
        setKnowledgeBases,
        addKnowledgeBase,
        removeKnowledgeBase,

        // Key Moments
        keyMoments,
        addKeyMoment,
        clearKeyMoments,

        // UI State
        isDarkMode,
        setIsDarkMode,
        debugMode,
        setDebugMode,

        // Navigation (Phase 3)
        activeView,
        navigateTo,
        activeSettingsTab,
        setActiveSettingsTab,
        isHydrated,
        isAboutModalOpen,
        setIsAboutModalOpen,

        // Toast
        toast,
        showToast,

        // SBC Phone calls
        sbcCalls,
        addSbcEvent,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
}
