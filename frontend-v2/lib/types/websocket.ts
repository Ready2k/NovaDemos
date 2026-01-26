// WebSocket message types
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'recording';

export interface WebSocketMessage {
    type: string;
    [key: string]: any;
}

// Incoming message types (Server -> Client)
export interface SessionStartMessage extends WebSocketMessage {
    type: 'session_start';
    sessionId: string;
    timestamp: string;
}

export interface AudioMessage extends WebSocketMessage {
    type: 'audio';
    audio: ArrayBuffer;
}

export interface TranscriptMessage extends WebSocketMessage {
    type: 'transcript';
    role: 'user' | 'assistant';
    text: string;
    isFinal: boolean;
    sentiment?: number;
}

export interface ToolUseMessage extends WebSocketMessage {
    type: 'tool_use';
    toolName: string;
    toolInput: any;
}

export interface ToolResultMessage extends WebSocketMessage {
    type: 'tool_result';
    toolName: string;
    toolResult: any;
}

export interface ErrorMessage extends WebSocketMessage {
    type: 'error';
    message: string;
    code?: string;
}

export interface TokenUsageMessage extends WebSocketMessage {
    type: 'token_usage';
    inputTokens: number;
    outputTokens: number;
}

export interface WorkflowUpdateMessage extends WebSocketMessage {
    type: 'workflow_update';
    currentStep: string;
    requirements: any[];
    status: string;
}

// Outgoing message types (Client -> Server)
export interface StartSessionMessage {
    type: 'start_session';
    config: any;
}

export interface AudioOutMessage {
    type: 'audio';
    audio: ArrayBuffer;
}

export interface TextMessage {
    type: 'text';
    text: string;
}

export interface StopSessionMessage {
    type: 'stop_session';
}

export interface InterruptMessage {
    type: 'interrupt';
}
