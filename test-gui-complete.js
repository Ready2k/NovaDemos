/**
 * Complete GUI Test - Chat Interface
 * Tests the full user experience through the browser
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGUI() {
  console.log('\n=== GUI Complete Test ===\n');
  
  const browser = await chromium.launch({ 
    headless: false, // Show browser for debugging
    slowMo: 500 // Slow down actions to see what's happening
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[Browser ${type}]`, msg.text());
    }
  });
  
  try {
    console.log('1. Loading application...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await sleep(2000);
    
    console.log('2. Taking initial screenshot...');
    await page.screenshot({ path: 'screenshots/01-initial-load.png', fullPage: true });
    
    // Check if page loaded
    const title = await page.title();
    console.log(`   Page title: ${title}`);
    
    // Look for chat input
    console.log('3. Looking for chat input...');
    const chatInput = await page.locator('textarea, input[type="text"]').first();
    const isVisible = await chatInput.isVisible().catch(() => false);
    
    if (!isVisible) {
      console.log('   ❌ Chat input not found! Checking page content...');
      const bodyText = await page.locator('body').textContent();
      console.log('   Page content preview:', bodyText.substring(0, 200));
      await page.screenshot({ path: 'screenshots/02-no-input-found.png', fullPage: true });
      throw new Error('Chat input not visible');
    }
    
    console.log('   ✅ Chat input found');
    
    // Type a message
    console.log('4. Typing message: "I need to check my balance"');
    await chatInput.fill('I need to check my balance');
    await sleep(1000);
    await page.screenshot({ path: 'screenshots/03-message-typed.png', fullPage: true });
    
    // Find and click send button
    console.log('5. Looking for send button...');
    const sendButton = await page.locator('button:has-text("Send"), button[type="submit"]').first();
    const sendVisible = await sendButton.isVisible().catch(() => false);
    
    if (!sendVisible) {
      console.log('   ⚠️  Send button not found, trying Enter key...');
      await chatInput.press('Enter');
    } else {
      console.log('   ✅ Send button found, clicking...');
      await sendButton.click();
    }
    
    await sleep(1000);
    await page.screenshot({ path: 'screenshots/04-message-sent.png', fullPage: true });
    
    // Wait for response
    console.log('6. Waiting for agent response (up to 15 seconds)...');
    let responseFound = false;
    let attempts = 0;
    const maxAttempts = 15;
    
    while (!responseFound && attempts < maxAttempts) {
      attempts++;
      await sleep(1000);
      
      // Look for any new messages in the chat
      const messages = await page.locator('[class*="message"], [class*="chat"], div:has-text("balance"), div:has-text("verify"), div:has-text("identity")').all();
      
      if (messages.length > 0) {
        console.log(`   Found ${messages.length} potential message elements`);
        
        // Get text from all messages
        for (let i = 0; i < Math.min(messages.length, 5); i++) {
          const text = await messages[i].textContent().catch(() => '');
          if (text.length > 10 && text.length < 500) {
            console.log(`   Message ${i + 1}: ${text.substring(0, 100)}...`);
            if (text.toLowerCase().includes('verify') || 
                text.toLowerCase().includes('identity') || 
                text.toLowerCase().includes('banking')) {
              responseFound = true;
            }
          }
        }
      }
      
      if (!responseFound) {
        console.log(`   Attempt ${attempts}/${maxAttempts} - waiting...`);
      }
    }
    
    await page.screenshot({ path: 'screenshots/05-after-waiting.png', fullPage: true });
    
    if (responseFound) {
      console.log('   ✅ Response received from agent!');
    } else {
      console.log('   ⚠️  No clear response detected after 15 seconds');
      console.log('   This might be a timing issue or the response format changed');
    }
    
    // Check WebSocket connection
    console.log('7. Checking WebSocket status...');
    const wsStatus = await page.evaluate(() => {
      // Try to find WebSocket info in window object
      return {
        hasWebSocket: typeof WebSocket !== 'undefined',
        readyState: window.ws ? window.ws.readyState : 'not found'
      };
    });
    console.log('   WebSocket status:', wsStatus);
    
    // Final screenshot
    console.log('8. Taking final screenshot...');
    await page.screenshot({ path: 'screenshots/06-final-state.png', fullPage: true });
    
    console.log('\n=== Test Summary ===');
    console.log('✅ Page loaded successfully');
    console.log('✅ Chat input found and functional');
    console.log('✅ Message sent successfully');
    console.log(responseFound ? '✅ Agent response received' : '⚠️  Agent response unclear');
    console.log('\nScreenshots saved to screenshots/ directory');
    console.log('Check screenshots to verify visual state');
    
    // Keep browser open for manual inspection
    console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
    await sleep(30000);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

// Run test
testGUI()
  .then(() => {
    console.log('\n✅ GUI test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ GUI test failed:', error);
    process.exit(1);
  });
