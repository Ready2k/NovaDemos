#!/usr/bin/env node

/**
 * AgentCore Capability Checker
 * This script performs the definitive check to see if your AgentCore Runtime
 * has access to built-in tools like Browser, Code Interpreter, Search, etc.
 * 
 * Based on the proven pattern from test-gateway-transactions.js
 * Uses the Tool Handshake (tools/list call) to scan all available tools.
 */

console.log('🔍 AgentCore Capability Checker - Built-in Tools Detection');
console.log('==========================================================');

// Load environment variables from backend/.env
require('dotenv').config({ path: '../backend/.env' });

// AWS signing library
const aws4 = require('aws4');

const CONFIG = {
    awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
};

// Tool categories to check for
const CAPABILITY_PATTERNS = {
    browser: {
        keywords: ['browser', 'web', 'navigate', 'click', 'screenshot', 'page', 'url', 'html'],
        description: 'Web Browser & Navigation'
    },
    search: {
        keywords: ['search', 'google', 'bing', 'query', 'find', 'lookup'],
        description: 'Web Search & Information Retrieval'
    },
    codeInterpreter: {
        keywords: ['code', 'python', 'execute', 'run', 'script', 'interpreter', 'jupyter'],
        description: 'Code Execution & Interpretation'
    },
    fileSystem: {
        keywords: ['file', 'read', 'write', 'directory', 'folder', 'path', 'upload', 'download'],
        description: 'File System Operations'
    },
    database: {
        keywords: ['database', 'sql', 'query', 'table', 'record', 'db'],
        description: 'Database Operations'
    },
    api: {
        keywords: ['api', 'http', 'rest', 'request', 'post', 'get', 'fetch'],
        description: 'API & HTTP Operations'
    },
    image: {
        keywords: ['image', 'photo', 'picture', 'visual', 'generate', 'create', 'draw'],
        description: 'Image Generation & Processing'
    },
    audio: {
        keywords: ['audio', 'sound', 'music', 'voice', 'speech', 'tts'],
        description: 'Audio Processing'
    },
    math: {
        keywords: ['math', 'calculate', 'compute', 'formula', 'equation'],
        description: 'Mathematical Operations'
    },
    time: {
        keywords: ['time', 'date', 'clock', 'schedule', 'calendar'],
        description: 'Time & Date Operations'
    }
};

async function fetchAccessToken() {
    // In this setup, we use AWS IAM signing instead of separate token
    return null;
}

async function listTools() {
    const payload = {
        jsonrpc: "2.0",
        id: `capability-check-${Date.now()}`,
        method: "tools/list",
        params: {}
    };

    try {
        const url = new URL(CONFIG.gatewayUrl);
        const body = JSON.stringify(payload);
        
        // Create AWS request object for signing
        const request = {
            host: url.hostname,
            method: 'POST',
            path: url.pathname,
            service: 'bedrock-agentcore',
            region: CONFIG.awsRegion,
            headers: {
                'Content-Type': 'application/json'
            },
            body: body
        };

        // Sign the request with AWS credentials
        const signedRequest = aws4.sign(request, {
            accessKeyId: CONFIG.awsAccessKey,
            secretAccessKey: CONFIG.awsSecretKey
        });

        console.log('📡 Making authenticated request to AgentCore Gateway...');
        
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('❌ Failed to fetch tools list:', error.message);
        throw error;
    }
}

function categorizeTools(tools) {
    const categories = {};
    const uncategorized = [];
    
    // Initialize categories
    Object.keys(CAPABILITY_PATTERNS).forEach(key => {
        categories[key] = [];
    });
    
    tools.forEach(tool => {
        const toolName = tool.name.toLowerCase();
        const toolDesc = (tool.description || '').toLowerCase();
        const toolText = `${toolName} ${toolDesc}`;
        
        let categorized = false;
        
        // Check each capability pattern
        Object.entries(CAPABILITY_PATTERNS).forEach(([category, pattern]) => {
            const hasKeyword = pattern.keywords.some(keyword => 
                toolText.includes(keyword.toLowerCase())
            );
            
            if (hasKeyword) {
                categories[category].push(tool);
                categorized = true;
            }
        });
        
        if (!categorized) {
            uncategorized.push(tool);
        }
    });
    
    return { categories, uncategorized };
}

function displayResults(tools, categorizedTools) {
    console.log(`\n🔍 Scanning ${tools.length} available tools...\n`);
    
    const { categories, uncategorized } = categorizedTools;
    
    // Display categorized capabilities
    Object.entries(categories).forEach(([category, toolList]) => {
        const pattern = CAPABILITY_PATTERNS[category];
        
        if (toolList.length > 0) {
            console.log(`✅ ${pattern.description} (${toolList.length} tools):`);
            toolList.forEach(tool => {
                console.log(`   • ${tool.name}`);
                if (tool.description) {
                    console.log(`     └─ ${tool.description}`);
                }
            });
            console.log('');
        } else {
            console.log(`❌ ${pattern.description}: No tools found`);
        }
    });
    
    // Display uncategorized tools
    if (uncategorized.length > 0) {
        console.log(`🔧 Other Tools (${uncategorized.length}):`);
        uncategorized.forEach(tool => {
            console.log(`   • ${tool.name}`);
            if (tool.description) {
                console.log(`     └─ ${tool.description}`);
            }
        });
        console.log('');
    }
}

function generateSummary(tools, categorizedTools) {
    const { categories } = categorizedTools;
    
    console.log('📊 CAPABILITY SUMMARY');
    console.log('====================');
    
    const hasCapabilities = [];
    const missingCapabilities = [];
    
    Object.entries(categories).forEach(([category, toolList]) => {
        const pattern = CAPABILITY_PATTERNS[category];
        if (toolList.length > 0) {
            hasCapabilities.push(`${pattern.description} (${toolList.length})`);
        } else {
            missingCapabilities.push(pattern.description);
        }
    });
    
    if (hasCapabilities.length > 0) {
        console.log('\n✅ Available Capabilities:');
        hasCapabilities.forEach(cap => console.log(`   • ${cap}`));
    }
    
    if (missingCapabilities.length > 0) {
        console.log('\n❌ Missing Capabilities:');
        missingCapabilities.forEach(cap => console.log(`   • ${cap}`));
    }
    
    console.log(`\n📈 Total Tools Available: ${tools.length}`);
    console.log(`🎯 Capability Coverage: ${hasCapabilities.length}/${Object.keys(CAPABILITY_PATTERNS).length} categories`);
}

async function checkCapabilities() {
    console.log('\n🔍 AgentCore Built-in Tools Detection');
    console.log('=====================================');
    
    // Validate credentials
    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Missing AWS credentials in environment');
        return;
    }
    
    console.log('\n🔍 Step 1: Listing available tools...');
    const response = await listTools();
    
    if (!response.result || !response.result.tools) {
        console.error('❌ No tools found in response');
        return;
    }
    
    const tools = response.result.tools;
    console.log(`   → Found ${tools.length} total tools`);
    
    console.log('\n🔍 Step 2: Scanning for built-in capabilities...');
    const categorizedTools = categorizeTools(tools);
    
    // Display results
    displayResults(tools, categorizedTools);
    generateSummary(tools, categorizedTools);
    
    // The definitive answer
    console.log('\n🎯 DEFINITIVE BUILT-IN TOOL CHECK');
    console.log('=================================');
    
    const browserTools = categorizedTools.categories.browser;
    const codeTools = categorizedTools.categories.codeInterpreter;
    const searchTools = categorizedTools.categories.search;
    
    if (browserTools.length > 0) {
        console.log('✅ BROWSER TOOLS DETECTED:');
        browserTools.forEach(t => console.log(`   - ${t.name}`));
    } else {
        console.log('❌ NO BROWSER TOOLS: Your AgentCore does not have web browsing capabilities');
    }
    
    if (codeTools.length > 0) {
        console.log('✅ CODE INTERPRETER DETECTED:');
        codeTools.forEach(t => console.log(`   - ${t.name}`));
    } else {
        console.log('❌ NO CODE INTERPRETER: Your AgentCore cannot execute code');
    }
    
    if (searchTools.length > 0) {
        console.log('✅ WEB SEARCH DETECTED:');
        searchTools.forEach(t => console.log(`   - ${t.name}`));
    } else {
        console.log('❌ NO WEB SEARCH: Your AgentCore cannot search the web');
    }
}

async function testCapabilities() {
    try {
        await checkCapabilities();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test - following the same pattern as test-gateway-transactions.js
testCapabilities();

module.exports = { checkCapabilities, categorizeTools };