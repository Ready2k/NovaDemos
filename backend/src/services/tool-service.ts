
import * as fs from 'fs';
import * as path from 'path';
import { Tool } from '../types';

const TOOLS_DIR = path.join(process.cwd(), 'tools');

export class ToolService {
    constructor() {
        if (!fs.existsSync(TOOLS_DIR)) {
            console.warn('[ToolService] Tools directory does not exist:', TOOLS_DIR);
        }
    }

    loadTools(): any[] {
        try {
            if (!fs.existsSync(TOOLS_DIR)) {
                return [];
            }
            const files = fs.readdirSync(TOOLS_DIR);
            return files.filter(f => f.endsWith('.json')).map(f => {
                try {
                    const content = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf-8');
                    const toolDef = JSON.parse(content);

                    // Transform to Bedrock Tool Spec format
                    // 1. Rename input_schema -> inputSchema (also support 'parameters')
                    // 2. Wrap schema in { json: ... }
                    const schema = toolDef.input_schema || toolDef.inputSchema || toolDef.parameters;

                    // CRITICAL FIX: Append instruction to description so LLM sees it
                    let finalDescription = toolDef.description || "";
                    if (toolDef.instruction) {
                        finalDescription += `\n\n[INSTRUCTION]: ${toolDef.instruction}`;
                    }

                    const toolSpec: any = {
                        name: toolDef.name,
                        description: finalDescription,
                        inputSchema: {
                            json: JSON.stringify(schema || {
                                type: "object",
                                properties: {},
                                required: []
                            })
                        }
                    };

                    return {
                        toolSpec: toolSpec,
                        instruction: toolDef.instruction, // Pass instruction to frontend
                        agentPrompt: toolDef.agentPrompt, // New: AgentCore prompt override
                        gatewayTarget: toolDef.gatewayTarget // New: Gateway target
                    };
                } catch (e) {
                    console.error(`[ToolService] Failed to load tool ${f}:`, e);
                    return null;
                }
            }).filter(t => t !== null);
        } catch (err) {
            console.error('[ToolService] Failed to list tools:', err);
            return [];
        }
    }
}
