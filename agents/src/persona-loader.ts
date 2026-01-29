import * as fs from 'fs';
import * as path from 'path';
import { PersonaConfig, PersonaLoadResult } from './persona-types';

/**
 * PersonaLoader
 * 
 * Loads persona configuration files and their associated prompt files.
 * Provides a unified interface for accessing persona settings.
 */
export class PersonaLoader {
  private personasDir: string;
  private promptsDir: string;

  constructor(personasDir: string, promptsDir: string) {
    this.personasDir = personasDir;
    this.promptsDir = promptsDir;
  }

  /**
   * Load a persona configuration by ID
   */
  loadPersona(personaId: string): PersonaLoadResult {
    try {
      // Load persona config file
      const configPath = path.join(this.personasDir, `${personaId}.json`);
      
      if (!fs.existsSync(configPath)) {
        return {
          success: false,
          error: `Persona config not found: ${configPath}`
        };
      }

      const personaConfig: PersonaConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf-8')
      );

      // Load prompt file if specified
      let systemPrompt = '';
      if (personaConfig.promptFile) {
        const promptPath = path.join(this.promptsDir, personaConfig.promptFile);
        
        if (fs.existsSync(promptPath)) {
          systemPrompt = fs.readFileSync(promptPath, 'utf-8');
          console.log(`[PersonaLoader] Loaded prompt: ${personaConfig.promptFile} (${systemPrompt.length} chars)`);
        } else {
          console.warn(`[PersonaLoader] Prompt file not found: ${promptPath}`);
        }
      }

      return {
        success: true,
        persona: personaConfig,
        systemPrompt
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Failed to load persona: ${error.message}`
      };
    }
  }

  /**
   * Check if a tool is allowed for a persona
   */
  isToolAllowed(personaConfig: PersonaConfig, toolName: string): boolean {
    return personaConfig.allowedTools.includes(toolName);
  }

  /**
   * Get all allowed tools for a persona
   */
  getAllowedTools(personaConfig: PersonaConfig): string[] {
    return personaConfig.allowedTools;
  }

  /**
   * Check if a workflow is valid for a persona
   */
  isWorkflowAllowed(personaConfig: PersonaConfig, workflowId: string): boolean {
    return personaConfig.workflows.includes(workflowId);
  }

  /**
   * List all available personas
   */
  listPersonas(): string[] {
    try {
      if (!fs.existsSync(this.personasDir)) {
        return [];
      }

      return fs.readdirSync(this.personasDir)
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      console.error('[PersonaLoader] Failed to list personas:', error);
      return [];
    }
  }
}
