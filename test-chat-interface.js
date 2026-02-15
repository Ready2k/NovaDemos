/**
 * Playwright Test: Chat Interface Balance Request
 * 
 * This test:
 * 1. Opens the frontend at localhost:3000
 * 2. Waits for the page to load
 * 3. Connects to the WebSocket
 * 4. Sends "I need to check my balance" via the chat interface
 * 5. Waits for and captures the response
 */

const { chromium } = require('playwright');

async function runTest() {
    console.log('[Test] Starting Playwright test...');
    
    const browser = await chromium.launch({
        headless: false, // Show browser for debugging
        slowMo: 500 // Slow down actions for visibility
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Enable console logging from the page
    page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning' || msg.text().includes('[WebSocket]') || msg.text().includes('[Gateway]')) {
            console.log(`[Browser ${type}]`, msg.text());
        }
    });
    
    // Listen for WebSocket frames
    page.on('websocket', ws => {
        console.log(`[Test] WebSocket opened: ${ws.url()}`);
        
        ws.on('framesent', frame => {
            if (frame.payload) {
                try {
                    const text = frame.payload.toString();
                    if (text.startsWith('{')) {
                        const data = JSON.parse(text);
                        console.log('[Test] → Sent:', data.type, data.text ? `"${data.text}"` : '');
                    }
                } catch (e) {
                    // Binary frame, ignore
                }
            }
        });
        
        ws.on('framereceived', frame => {
            if (frame.payload) {
                try {
                    const text = frame.payload.toString();
                    if (text.startsWith('{')) {
                        const data = JSON.parse(text);
                        if (data.type === 'transcript' && data.text) {
                            console.log(`[Test] ← Received transcript (${data.role}): "${data.text}"`);
                        } else if (data.type === 'connected') {
                            console.log('[Test] ← Connected to backend, sessionId:', data.sessionId);
                        } else if (data.type === 'handoff_event') {
                            console.log('[Test] ← Handoff event:', data.target);
                        } else if (data.type === 'tool_use') {
                            console.log('[Test] ← Tool use:', data.toolName);
                        } else if (data.type === 'tool_result') {
                            console.log('[Test] ← Tool result:', data.toolName, data.success ? '✅' : '❌');
                        }
                    }
                } catch (e) {
                    // Binary frame, ignore
                }
            }
        });
    });
    
    try {
        console.log('[Test] Navigating to http://localhost:3000...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        
        console.log('[Test] Waiting for page to load...');
        await page.waitForTimeout(2000);
        
        // Find and click the connect button
        console.log('[Test] Looking for connect button...');
        const connectButton = await page.locator('button[title*="Connect"]').first();
        
        if (await connectButton.isVisible()) {
            console.log('[Test] Clicking connect button...');
            await connectButton.click();
            
            // Wait for connection to establish
            console.log('[Test] Waiting for connection...');
            await page.waitForTimeout(3000);
        } else {
            console.log('[Test] Already connected or button not found');
        }
        
        // Find the chat input field
        console.log('[Test] Looking for chat input...');
        const chatInput = await page.locator('input[type="text"], textarea').first();
        
        if (await chatInput.isVisible()) {
            console.log('[Test] Found chat input, typing message...');
            await chatInput.fill('I need to check my balance');
            
            // Wait a moment for the text to be entered
            await page.waitForTimeout(500);
            
            // Find and click the send button (or press Enter)
            console.log('[Test] Sending message...');
            await chatInput.press('Enter');
            
            console.log('[Test] ✅ Message sent: "I need to check my balance"');
            
            // Wait for response
            console.log('[Test] Waiting for response (30 seconds)...');
            await page.waitForTimeout(30000);
            
            // Check for messages in the chat
            const messages = await page.locator('[class*="message"], [class*="chat"]').allTextContents();
            console.log('[Test] Messages found:', messages.length);
            
        } else {
            console.log('[Test] ❌ Chat input not found');
        }
        
        console.log('[Test] Test complete. Keeping browser open for 60 seconds to observe...');
        await page.waitForTimeout(60000);
        
    } catch (error) {
        console.error('[Test] ❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
        console.log('[Test] Browser closed');
    }
}

// Run the test
runTest().catch(console.error);
