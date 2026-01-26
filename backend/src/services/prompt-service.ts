/**
 * Langfuse Prompt Management Service
 * 
 * Handles prompt versioning, retrieval, and promotion to production.
 */

import { Langfuse } from 'langfuse';

export interface PromptVersion {
    version: number;
    name: string;
    prompt: string;
    config: any;
    labels: string[];
    createdAt: string;
}

export class PromptService {
    private langfuse: Langfuse;

    constructor(langfuse: Langfuse) {
        this.langfuse = langfuse;
    }

    /**
     * Get the latest version of a prompt with a specific label
     * @param name - Prompt name
     * @param label - Label to fetch (default: "production")
     * @param cacheTtlSeconds - Cache TTL (0 = no cache, instant sync)
     */
    async getLatestPrompt(name: string, label: string = 'production', cacheTtlSeconds: number = 0): Promise<PromptVersion | null> {
        try {
            console.log(`[PromptService] Fetching prompt '${name}' with label '${label}'...`);

            const prompt = await this.langfuse.getPrompt(name, undefined, {
                label: label,
                cacheTtlSeconds: cacheTtlSeconds
            });

            if (!prompt) {
                console.warn(`[PromptService] Prompt '${name}' not found`);
                return null;
            }

            return {
                version: prompt.version,
                name: prompt.name,
                prompt: prompt.prompt,
                config: prompt.config || {},
                labels: [], // Labels not directly available in response
                createdAt: new Date().toISOString() // Approximate
            };
        } catch (error: any) {
            console.error(`[PromptService] Error fetching prompt '${name}':`, error.message);
            return null;
        }
    }

    /**
     * Create a new version of a prompt
     * @param name - Prompt name
     * @param text - Prompt text content
     * @param config - Optional configuration (temperature, etc.)
     * @param labels - Initial labels for the new version
     */
    async saveNewPromptVersion(
        name: string,
        text: string,
        config: any = {},
        labels: string[] = ['latest', 'dev']
    ): Promise<number> {
        try {
            console.log(`[PromptService] Creating new version of prompt '${name}'...`);

            const newPrompt = await this.langfuse.createPrompt({
                name: name,
                prompt: text,
                config: config,
                labels: labels,
                type: 'text'
            });

            console.log(`[PromptService] Created version ${newPrompt.version} of prompt '${name}'`);
            return newPrompt.version;
        } catch (error: any) {
            console.error(`[PromptService] Error creating prompt version:`, error.message);
            throw error;
        }
    }

    /**
     * Promote a specific version to production
     * This moves the "production" label from the old version to the new one
     * @param name - Prompt name
     * @param version - Version number to promote
     */
    async promoteToProduction(name: string, version: number): Promise<void> {
        try {
            console.log(`[PromptService] Promoting version ${version} of '${name}' to production...`);

            // Update the prompt to add the "production" label
            // This automatically removes it from the previous version
            await this.langfuse.updatePrompt({
                name: name,
                version: version,
                newLabels: ['production']
            });

            console.log(`[PromptService] Successfully promoted version ${version} to production`);
        } catch (error: any) {
            console.error(`[PromptService] Error promoting prompt:`, error.message);
            throw error;
        }
    }

    /**
     * List all versions of a prompt
     * Note: Langfuse SDK doesn't have a direct method for this,
     * so we'll need to track versions manually or use the API directly
     */
    async listPromptVersions(_name: string): Promise<PromptVersion[]> {
        // This would require direct API calls to Langfuse
        // For now, return empty array - can be implemented later if needed
        console.warn(`[PromptService] listPromptVersions not yet implemented`);
        return [];
    }

    /**
     * Save a new version and automatically promote it to production
     * Convenience method for the common workflow
     */
    async saveAndPromote(name: string, text: string, config: any = {}): Promise<number> {
        try {
            // Create new version with both "latest" and "production" labels
            const version = await this.saveNewPromptVersion(
                name,
                text,
                config,
                ['latest', 'production']
            );

            console.log(`[PromptService] Saved and promoted version ${version} of '${name}'`);
            return version;
        } catch (error: any) {
            console.error(`[PromptService] Error in saveAndPromote:`, error.message);
            throw error;
        }
    }
}
