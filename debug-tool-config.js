#!/usr/bin/env node

/**
 * Debug script to check tool configuration format
 */

const fs = require('fs');
const path = require('path');

function loadTools() {
    const TOOLS_DIR = path.join(__dirname, 'tools');
    try {
        const files = fs.readdirSync(TOOLS_DIR);
        return files.filter(f => f.endsWith('.json')).map(f => {
            try {
                const content = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf-8');
                const toolDef = JSON.parse(content);

                // Transform to Bedrock Tool Spec format
                const toolSpec = {
                    name: toolDef.name,
                    description: toolDef.description,
                    inputSchema: {
                        json: JSON.stringify(toolDef.input_schema || toolDef.inputSchema)
                    }
                };

                return {
                    toolSpec: toolSpec,
                    instruction: toolDef.instruction,
                    agentPrompt: toolDef.agentPrompt
                };
            } catch (e) {
                console.error(`Failed to load tool ${f}:`, e);
                return null;
            }
        }).filter(t => t !== null);
    } catch (err) {
        console.error('Failed to list tools:', err);
        return [];
    }
}

console.log('=== TOOL CONFIGURATION DEBUG ===\n');

const tools = loadTools();
console.log(`Loaded ${tools.length} tools:\n`);

tools.forEach((tool, index) => {
    console.log(`Tool ${index + 1}: ${tool.toolSpec.name}`);
    console.log('Full toolSpec:', JSON.stringify(tool.toolSpec, null, 2));
    console.log('inputSchema.json type:', typeof tool.toolSpec.inputSchema.json);
    console.log('inputSchema.json value:', tool.toolSpec.inputSchema.json);
    console.log('---');
});

// Test the wrapped format for Nova Sonic
const mappedTools = tools.map(t => ({ toolSpec: t.toolSpec }));
console.log('\n=== MAPPED TOOLS FOR NOVA SONIC ===');
console.log(JSON.stringify(mappedTools, null, 2));

// Test the tool configuration structure
const toolConfiguration = {
    tools: mappedTools
};
console.log('\n=== TOOL CONFIGURATION STRUCTURE ===');
console.log(JSON.stringify(toolConfiguration, null, 2));