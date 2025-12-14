const WebSocket = require('ws');

const SESSION_ID = 'test-session-' + Math.random().toString(36).substring(7);
const WS_URL = 'ws://localhost:8080/sonic';
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('[KBTest] Connected to server');

    // 1. Send Session Config
    const config = {
        type: 'sessionConfig',
        config: {
            sessionId: SESSION_ID,
            // Ensure KB tool is selected
            selectedTools: ['search_knowledge_base'],
            linkedWorkflows: [], // No strict workflow
            systemPrompt: "You are a helpful assistant. You have access to a tool called 'search_knowledge_base'. You MUST use this tool to answer ANY question about mortgages. Do not answer from your own knowledge."
        }
    };
    console.log('[KBTest] 📤 Sending configuration...');
    ws.send(JSON.stringify(config));

    // 2. Wait a bit then send prompt
    setTimeout(() => {
        console.log(`[KBTest] Session ID: ${SESSION_ID}`);
        const promptText = `Use the search_knowledge_base tool to find out what the mortgage application process is. Query ID: ${Math.random()}`;
        console.log(`[KBTest] 📤 Sending query: "${promptText}"`);
        ws.send(JSON.stringify({
            type: 'textInput',
            text: promptText
        }));
    }, 2000);
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data);
        if (msg.type === 'transcript' && msg.role === 'assistant') {
            console.log(`[KBTest] 🤖 Assistant: "${msg.text}"`);
        }
    } catch (e) {
        // Ignore binary audio
    }
});

ws.on('error', (err) => {
    console.error('[KBTest] Error:', err);
});

ws.on('close', () => {
    console.log('[KBTest] Disconnected');
});

// Keep alive for a bit to receive response
setTimeout(() => {
    console.log('[KBTest] Timeout reached, closing.');
    ws.close();
    process.exit(0);
}, 15000);
