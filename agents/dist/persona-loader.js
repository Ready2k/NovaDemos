"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * PersonaLoader
 *
 * Loads persona configuration files and their associated prompt files.
 * Provides a unified interface for accessing persona settings.
 */
class PersonaLoader {
    constructor(personasDir, promptsDir) {
        this.personasDir = personasDir;
        this.promptsDir = promptsDir;
    }
    /**
     * Load a persona configuration by ID
     */
    loadPersona(personaId) {
        try {
            // Load persona config file
            const configPath = path.join(this.personasDir, `${personaId}.json`);
            if (!fs.existsSync(configPath)) {
                return {
                    success: false,
                    error: `Persona config not found: ${configPath}`
                };
            }
            const personaConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            // Load prompt file if specified
            let systemPrompt = '';
            if (personaConfig.promptFile) {
                const promptPath = path.join(this.promptsDir, personaConfig.promptFile);
                if (fs.existsSync(promptPath)) {
                    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
                    console.log(`[PersonaLoader] Loaded prompt: ${personaConfig.promptFile} (${systemPrompt.length} chars)`);
                }
                else {
                    console.warn(`[PersonaLoader] Prompt file not found: ${promptPath}`);
                }
            }
            return {
                success: true,
                persona: personaConfig,
                systemPrompt
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to load persona: ${error.message}`
            };
        }
    }
    /**
     * Check if a tool is allowed for a persona
     */
    isToolAllowed(personaConfig, toolName) {
        return personaConfig.allowedTools.includes(toolName);
    }
    /**
     * Get all allowed tools for a persona
     */
    getAllowedTools(personaConfig) {
        return personaConfig.allowedTools;
    }
    /**
     * Check if a workflow is valid for a persona
     */
    isWorkflowAllowed(personaConfig, workflowId) {
        return personaConfig.workflows.includes(workflowId);
    }
    /**
     * List all available personas
     */
    listPersonas() {
        try {
            if (!fs.existsSync(this.personasDir)) {
                return [];
            }
            return fs.readdirSync(this.personasDir)
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        }
        catch (error) {
            console.error('[PersonaLoader] Failed to list personas:', error);
            return [];
        }
    }
}
exports.PersonaLoader = PersonaLoader;
