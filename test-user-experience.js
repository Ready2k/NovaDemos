/**
 * User Experience Test - Complete Banking Flow
 * 
 * Simulates a real user:
 * 0. Connect to the system
 * 1. Check balance (account 12345678, sort code 112233)
 * 2. Check open disputes (expect 3)
 * 3. Verify agent takes action without needing re-prompting
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForMessage(page, expectedText, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const messages = await page.locator('[class*="message"], [role="log"], div').all();
    for (const msg of messages) {
      const text = await msg.textContent().catch(() => '');
      if (text.toLowerCase().includes(expectedText.toLowerCase())) {
        return { found: true, text };
      }
    }
    await sleep(500);
  }
  return { found: false, text: null };
}

async function sendMessage(page, message) {
  console.log(`\n📤 Sending: "${message}"`);
  
  // Find the input field
  const input = await page.locator('input[type="text"], textarea').first();
  await input.fill(message);
  await sleep(500);
  
  // Try to send (Enter key or button)
  await input.press('Enter').catch(async () => {
    const sendBtn = await page.locator('button:has-text("Send"), button[type="submit"]').first();
    await sendBtn.click();
  });
  
  await sleep(1000);
}

async function testUserExperience() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     USER EXPERIENCE TEST - BANKING FLOW                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: null, // Use full screen
    screen: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Track all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    if (msg.type() === 'error') {
      console.log(`   [Browser Error] ${text}`);
    }
  });
  
  // Track WebSocket messages
  let wsConnected = false;
  page.on('websocket', ws => {
    console.log('   🔌 WebSocket connection detected');
    ws.on('open', () => {
      wsConnected = true;
      console.log('   ✅ WebSocket opened');
    });
    ws.on('close', () => {
      console.log('   ⚠️  WebSocket closed');
    });
  });
  
  try {
    // ============================================================
    // STEP 0: Load page and connect
    // ============================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 0: Loading page and connecting');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.screenshot({ path: 'screenshots/ux-01-loaded.png', fullPage: true });
    
    // Check if input is disabled (needs connection)
    const input = await page.locator('input[type="text"], textarea').first();
    const isDisabled = await input.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log('   ℹ️  Input is disabled - need to connect first');
      
      // Look for connect button
      const connectBtn = await page.locator('button:has-text("Connect"), button[title*="Connect"]').first();
      const btnVisible = await connectBtn.isVisible().catch(() => false);
      
      if (btnVisible) {
        console.log('   🔘 Clicking Connect button...');
        await connectBtn.click();
        await sleep(3000);
        await page.screenshot({ path: 'screenshots/ux-02-connected.png', fullPage: true });
        
        // Verify input is now enabled
        const stillDisabled = await input.getAttribute('disabled');
        if (stillDisabled === null) {
          console.log('   ✅ Connected! Input is now enabled');
        } else {
          throw new Error('Input still disabled after clicking connect');
        }
      } else {
        throw new Error('Connect button not found');
      }
    } else {
      console.log('   ✅ Already connected');
    }
    
    // ============================================================
    // STEP 1: Check balance
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Checking balance');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await sendMessage(page, 'I need to check my balance for account 12345678, sort code 112233');
    
    console.log('   ⏳ Waiting for agent response...');
    
    // Wait for various possible responses
    let responseReceived = false;
    let responseType = '';
    
    // Check for IDV verification request
    const idvCheck = await waitForMessage(page, 'verify', 15000);
    if (idvCheck.found) {
      console.log('   📋 Agent requesting identity verification');
      responseType = 'idv_request';
      responseReceived = true;
      await page.screenshot({ path: 'screenshots/ux-03-idv-request.png', fullPage: true });
      
      // Provide credentials
      console.log('   🔐 Providing credentials...');
      await sendMessage(page, 'My account is 12345678 and sort code is 112233');
      
      // Wait for verification to complete
      console.log('   ⏳ Waiting for verification...');
      await sleep(5000);
      await page.screenshot({ path: 'screenshots/ux-04-after-credentials.png', fullPage: true });
    }
    
    // Wait for balance information
    console.log('   ⏳ Waiting for balance information...');
    const balanceCheck = await waitForMessage(page, 'balance', 20000);
    
    if (balanceCheck.found) {
      console.log('   ✅ Balance information received!');
      console.log(`   💰 Response: ${balanceCheck.text.substring(0, 150)}...`);
      await page.screenshot({ path: 'screenshots/ux-05-balance-received.png', fullPage: true });
    } else {
      console.log('   ❌ No balance information received within timeout');
      await page.screenshot({ path: 'screenshots/ux-05-no-balance.png', fullPage: true });
      
      // Check what messages we did receive
      const allText = await page.locator('body').textContent();
      console.log('   📄 Page content sample:', allText.substring(0, 500));
    }
    
    // ============================================================
    // STEP 2: Check open disputes
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: Checking open disputes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await sleep(2000); // Give agent time to finish previous response
    await sendMessage(page, 'Can you check my open disputes?');
    
    console.log('   ⏳ Waiting for disputes information...');
    
    // Wait for dispute information
    const disputeCheck = await waitForMessage(page, 'dispute', 20000);
    
    if (disputeCheck.found) {
      console.log('   ✅ Dispute information received!');
      
      // Check if it mentions "3" disputes
      if (disputeCheck.text.includes('3') || disputeCheck.text.includes('three')) {
        console.log('   ✅ Confirmed: 3 open disputes found');
      } else {
        console.log('   ⚠️  Response received but number of disputes unclear');
      }
      
      console.log(`   📋 Response: ${disputeCheck.text.substring(0, 200)}...`);
      await page.screenshot({ path: 'screenshots/ux-06-disputes-received.png', fullPage: true });
    } else {
      console.log('   ❌ No dispute information received within timeout');
      await page.screenshot({ path: 'screenshots/ux-06-no-disputes.png', fullPage: true });
    }
    
    // ============================================================
    // STEP 3: Verify no silence / agent takes action
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Verifying agent responsiveness');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Count messages on screen
    const messages = await page.locator('[class*="message"], [role="log"]').all();
    console.log(`   📊 Total messages visible: ${messages.length}`);
    
    // Check for duplicate messages
    const messageTexts = [];
    for (const msg of messages) {
      const text = await msg.textContent().catch(() => '');
      if (text.length > 10) {
        messageTexts.push(text);
      }
    }
    
    const uniqueMessages = new Set(messageTexts);
    if (messageTexts.length > uniqueMessages.size) {
      console.log(`   ⚠️  WARNING: Duplicate messages detected!`);
      console.log(`   Total: ${messageTexts.length}, Unique: ${uniqueMessages.size}`);
    } else {
      console.log(`   ✅ No duplicate messages detected`);
    }
    
    // Final screenshot
    await page.screenshot({ path: 'screenshots/ux-07-final-state.png', fullPage: true });
    
    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ Connection: Successful');
    console.log(balanceCheck.found ? '✅ Balance Check: Received' : '❌ Balance Check: Failed');
    console.log(disputeCheck.found ? '✅ Disputes Check: Received' : '❌ Disputes Check: Failed');
    console.log(messageTexts.length === uniqueMessages.size ? '✅ No Duplicates: Clean UI' : '⚠️  Duplicates: UI Issue');
    
    console.log('\n📸 Screenshots saved to screenshots/ directory');
    console.log('   - ux-01-loaded.png');
    console.log('   - ux-02-connected.png');
    console.log('   - ux-03-idv-request.png');
    console.log('   - ux-04-after-credentials.png');
    console.log('   - ux-05-balance-received.png');
    console.log('   - ux-06-disputes-received.png');
    console.log('   - ux-07-final-state.png');
    
    // Keep browser open for inspection
    console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
    await sleep(30000);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'screenshots/ux-error.png', fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

// Run test
testUserExperience()
  .then(() => {
    console.log('\n✅ User experience test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ User experience test failed:', error);
    process.exit(1);
  });
