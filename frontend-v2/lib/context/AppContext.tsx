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
    activeView: 'chat' | 'settings' | 'workflow' | 'history';
    navigateTo: (view: 'chat' | 'settings' | 'workflow' | 'history') => void;
    activeSettingsTab: string;
    setActiveSettingsTab: (tab: string) => void;
    resetSession: () => void;
    isAboutModalOpen: boolean;
    setIsAboutModalOpen: (open: boolean) => void;

    // Toast (Phase 3)
    toast: { message: string, type: 'success' | 'error' | 'info' | null };
    showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Default settings
const defaultSettings: AppSettings = {
    interactionMode: 'chat_voice',
    brainMode: 'raw_nova',
    voicePreset: 'matthew',
    personaPreset: '',
    enableGuardrails: true,
    systemPrompt: 'You are a warm, professional, and helpful AI assistant. Give accurate answers that sound natural, direct, and human. Start by answering the user\'s question clearly in 1–2 sentences. Then, expand only enough to make the answer understandable, staying within 3–5 short sentences total. Avoid sounding like a lecture or essay.',
    speechPrompt: '',
    enabledTools: [],
    knowledgeBases: [],
    costConfig: {
        nova: {
            inputCost: 0.000003,
            outputCost: 0.000012,
        },
        agent: {
            inputCost: 0.000003,
            outputCost: 0.000012,
        },
    },
    showWorkflowVisualization: true,
    linkedWorkflows: [],
    debugMode: false,
};

export function AppProvider({ children }: { children: ReactNode }) {
    // Connection state
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

    // Session state
    const [currentSession, setCurrentSession] = useState<Session | null>(null);

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
        setCurrentSession(prev => prev ? { ...prev, ...stats } : null);
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

    // UI state
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [debugMode, setDebugMode] = useState(false);

    // Navigation State (Phase 3)
    const [activeView, setActiveView] = useState<'chat' | 'settings' | 'workflow' | 'history'>('chat');
    const [activeSettingsTab, setActiveSettingsTab] = useState('general');

    const navigateTo = useCallback((view: 'chat' | 'settings' | 'workflow' | 'history') => {
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
