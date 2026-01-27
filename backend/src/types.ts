
import { WebSocket } from 'ws';
import { SonicClient } from './sonic-client';
import { TranscribeClientWrapper } from './transcribe-client';

export interface Tool {
    toolSpec: {
        name: string;
        description?: string;
        inputSchema: {
            json: any;
        };
    };
}

export interface ClientSession {
    ws: WebSocket;
    sonicClient: SonicClient;
    sessionId: string;
    // Agent Mode State
    brainMode: 'raw_nova' | 'bedrock_agent';
    agentId?: string;
    agentAliasId?: string;
    agentBuffer: Buffer[];
    transcribeClient: TranscribeClientWrapper;
    silenceTimer: NodeJS.Timeout | null;
    isInterrupted: boolean;
    isIntercepting?: boolean; // New: Flag to suppress audio if we catch a hallucination
    initialGreetingTimer?: NodeJS.Timeout | null; // Track initial greeting to prevent duplicates
    lastUserTranscript?: string;
    langfuseTrace?: any; // Langfuse Trace Object
    // Deduplication
    lastAgentReply?: string;
    lastAgentReplyTime?: number;
    recentAgentReplies?: Array<{ text: string, originalText?: string, time: number }>; // Track multiple recent messages
    // Tools
    tools?: Tool[];
    allowedTools?: string[]; // Tools permitted for execution (checked server-side)
    isAuthenticated?: boolean; // Tracks if IDV check passed
    // Audio Buffering (Lookahead)
    isBufferingAudio?: boolean;
    audioBufferQueue?: Buffer[];
    hasFlowedAudio?: boolean;
    // Voice Config
    voiceId?: string;
    activeDialect?: string; // Currently detected dialect
    dialectConfidence?: number; // Confidence level of dialect detection
    voiceLockEnabled?: boolean; // Voice lock toggle - prevents automatic voice switching
    voiceMapping?: Record<string, string>; // Custom locale -> voiceId mapping
    activeLocale?: string; // Currently detected locale from Transcribe
    localeConfidence?: number; // Confidence of locale detection

    // Context Variables
    userLocation?: string;
    userTimezone?: string;

    // Tool Result Caching
    toolResultCache?: Map<string, {
        result: any;
        timestamp: number;
        toolName: string;
        query: string;
    }>;

    // Tool Execution Deduplication
    recentToolExecutions?: Map<string, {
        toolName: string;
        parameters: any;
        timestamp: number;
        result: any;
    }>;

    // Chat History
    transcript: {
        role: string;
        text: string;
        timestamp: number;
        type?: 'speculative' | 'final' | 'workflow_step'; // New: Track type of transcript
        sentiment?: number; // Check sentiment
        metadata?: any; // Extra data (e.g. stepId, contextKeys)
    }[];

    // AWS Credentials (Per Session)
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    agentCoreRuntimeArn?: string;
    feedback?: any; // New: Store feedback from user

    // Workflow State
    activeWorkflowStepId?: string;
    currentWorkflowId?: string; // Track active workflow name
    // Simulation / Test State
    isTest?: boolean;
    testResult?: 'PASS' | 'FAIL' | 'UNKNOWN';
    userResult?: 'PASS' | 'FAIL' | 'UNKNOWN';
    testName?: string;
    workflowChecks?: { [key: string]: string }; // Track collected variables for UI

    // Tool Deduplication
    toolsCalledThisTurn?: string[]; // Track tools called in current turn
    processedToolIds?: Set<string>; // Track processed tool IDs to prevent duplicates
    phantomCorrectionCount?: number; // Track number of corrections attempted
}
