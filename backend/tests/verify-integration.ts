
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/sonic';

function runTest() {
    console.log(`[Test] Connecting to ${WS_URL}...`);
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('[Test] Connected.');

        // 1. Send Session Config
        const configMsg = {
            type: 'sessionConfig',
            config: {
                brainMode: 'langgraph',
                workflowId: 'banking-master', // Optional, defaults to banking-master
                inputMode: 'text' // Don't require audio
            }
        };
        console.log('[Test] Sending Config:', JSON.stringify(configMsg));
        ws.send(JSON.stringify(configMsg));

        // 2. Wait a bit, then send Text Input
        setTimeout(() => {
            const inputMsg = {
                type: 'textInput',
                text: 'I want to dispute a transaction'
            };
            console.log('[Test] Sending Input:', JSON.stringify(inputMsg));
            ws.send(JSON.stringify(inputMsg));
        }, 1000);
    });

    ws.on('message', (data) => {
        try {
            const str = data.toString();
            const msg = JSON.parse(str);

            if (msg.type === 'graph_event') {
                console.log('✅ [PASS] Received Graph Event:', JSON.stringify(msg.data, null, 2));
                // We verify that we got the event, we can exit or keep listening
                // Check if we hit the end
                const nodeName = Object.keys(msg.data)[0];
                if (nodeName === 'master_end') {
                    console.log('🎉 [SUCCESS] Workflow Reached End!');
                    ws.close();
                    process.exit(0);
                }
            } else if (msg.type === 'transcript') {
                console.log(`[Transcript] ${msg.role}: ${msg.text}`);
            } else {
                console.log(`[Message] Type: ${msg.type}`);
            }

        } catch (e) {
            // Binary or other
        }
    });

    ws.on('error', (err) => {
        console.error('[Test] WebSocket Error:', err);
        process.exit(1);
    });

    // Timeout
    setTimeout(() => {
        console.log('[Test] Timeout waiting for graph execution.');
        ws.close();
        process.exit(1);
    }, 10000); // 10s timeout
}

runTest();
