/**
 * Persona Configuration Types
 * 
 * Defines the structure for persona configuration files that link
 * prompts, workflows, and tools together.
 */

export interface PersonaConfig {
  id: string;
  name: string;
  description: string;
  promptFile: string | null;
  workflows: string[];
  allowedTools: string[];
  voiceId: string;
  metadata: {
    language: string;
    region?: string;
    tone?: string;
    specializations?: string[];
    [key: string]: any;
  };
}

export interface PersonaLoadResult {
  success: boolean;
  persona?: PersonaConfig;
  systemPrompt?: string;
  error?: string;
}
