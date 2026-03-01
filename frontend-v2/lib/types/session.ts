// Session and transcript types

export interface AcousticFeatures {
    energy: number;
    energyVariance: number;
    energyTrend: number;
    speakingRate: number;
    pauseCount: number;
}

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'tool';
    content: string;
    text?: string; // Support for backend property name
    timestamp: string | number;
    sentiment?: number;
    isFinal?: boolean;
    feedback?: 'up' | 'down';
    type?: 'final' | 'speculative' | 'tool_use' | 'tool_result' | 'workflow_step';
    metadata?: any;
    acousticFeatures?: AcousticFeatures;
}

export interface Session {
    sessionId: string;
    startTime: string;
    endTime?: string;
    duration: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    transcript: Message[];
    brainMode?: string;
    voicePreset?: string;
    detectedLanguage?: string;
    languageConfidence?: number;
    lastTtft?: number;
    avgTtft?: number;
    lastLatency?: number;
    avgLatency?: number;
    latencyTurns?: number;
    lastEnergy?: number;
    lastSpeakingRate?: number;
}

export interface SessionStats {
    duration: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    messageCount: number;
    averageSentiment?: number;
}

export interface HistoricalSession {
    filename: string;
    sessionId: string;
    date: string;
    time: string;
    duration: string;
    messageCount: number;
    firstMessage?: string;
    cost?: number;
}
