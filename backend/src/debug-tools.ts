import * as fs from 'fs';
import * as path from 'path';

const TOOLS_DIR = path.join(__dirname, '../../tools');

function loadTools(): any[] {
    try {
        const files = fs.readdirSync(TOOLS_DIR);
        return files.filter(f => f.endsWith('.json')).map(f => {
            try {
                const content = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf-8');
                const toolDef = JSON.parse(content);

                // Transform to Bedrock Tool Spec format
                // 1. Rename input_schema -> inputSchema (also support 'parameters')
                // 2. Wrap schema in { json: ... }
                const schema = toolDef.input_schema || toolDef.inputSchema || toolDef.parameters;
                const toolSpec: any = {
                    name: toolDef.name,
                    description: toolDef.description,
                    inputSchema: {
                        json: JSON.stringify(schema || {
                            type: "object",
                            properties: {},
                            required: []
                        })
                    }
                };

                return {
                    toolSpec: toolSpec
                };
            } catch (e) {
                console.error(`[Server] Failed to load tool ${f}:`, e);
                return null;
            }
        }).filter(t => t !== null);
    } catch (err) {
        console.error('[Server] Failed to list tools:', err);
        return [];
    }
}

console.log(JSON.stringify(loadTools(), null, 2));
