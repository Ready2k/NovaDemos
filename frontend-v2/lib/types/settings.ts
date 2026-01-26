import { TestConfiguration } from './workflow';

// Configuration and settings types

export type InteractionMode = 'chat_voice' | 'voice_only' | 'chat_only';
export type BrainMode = 'raw_nova' | 'bedrock_agent';
export type AppSettingsTab = 'general' | 'persona' | 'knowledge' | 'workflow' | 'presets' | 'system';

export interface VoicePreset {
    id: string;
    name: string;
}

export interface PersonaPreset {
    id: string;
    name: string;
    systemPrompt: string;
    speechPrompt?: string;
    linkedWorkflows?: string[];
}

export interface AppSettings {
    // General Settings
    interactionMode: InteractionMode;
    brainMode: BrainMode;
    voicePreset: string;
    personaPreset: string;
    agentId?: string;
    agentAliasId?: string;
    enableGuardrails: boolean;
    visualizationStyle?: 'simple_wave' | 'anti_gravity' | 'fluid_physics' | 'particle_vortex' | 'pulse_waveform';
    physicsSpeed?: number;
    physicsSensitivity?: number;
    contextGrowth?: number;

    // Persona Settings
    systemPrompt: string;
    speechPrompt?: string;

    // Tool Settings
    enabledTools: string[];

    // Knowledge Base Settings
    knowledgeBases: KnowledgeBase[];

    // AWS Settings
    awsConfig?: AWSConfig;

    // Cost Configuration
    costConfig: CostConfig;

    // Workflow Settings
    showWorkflowVisualization?: boolean;
    linkedWorkflows?: string[];

    // Simulation
    simulationMode?: boolean;
    simulationPersona?: string;
    testMode?: 'manual' | 'auto';
    activeTestConfig?: TestConfiguration;

    // Debug
    debugMode: boolean;
}

export interface AWSConfig {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    region: string;
    novaSonicModelId: string;
    agentCoreRuntimeArn?: string;
}

export interface CostConfig {
    nova: {
        inputCost: number;  // per 1K tokens
        outputCost: number; // per 1K tokens
    };
    agent: {
        inputCost: number;  // per 1K tokens
        outputCost: number; // per 1K tokens
    };
}

export interface KnowledgeBase {
    id: string;
    name: string;
    kbId: string;
    model: string;
}

export interface BedrockAgent {
    id: string;
    name: string;
    agentId: string;
    aliasId: string;
}
