// Session and transcript types

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    sentiment?: number;
    isFinal?: boolean;
    feedback?: 'up' | 'down';
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
