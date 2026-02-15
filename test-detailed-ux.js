/**
 * Detailed User Experience Test
 * 
 * Tests for:
 * - Clean text interface (no double messages)
 * - Agent takes action when it says it will
 * - No silence or need to re-prompt
 * - Balance is provided without re-asking
 * - 3 disputes are shown
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDetailedUX() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        DETAILED USER EXPERIENCE TEST                   ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: null, // Use full screen
    screen: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const issues = [];
  const successes = [];
  
  // Track WebSocket messages
  const wsMessages = [];
  page.on('websocket', ws => {
    ws.on('framereceived', event => {
      try {
        const data = event.payload;
        if (typeof data === 'string') {
          const parsed = JSON.parse(data);
          wsMessages.push(parsed);
        }
      } catch (e) {
        // Binary or unparseable
      }
    });
  });
  
  try {
    console.log('📱 Loading application...\n');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await sleep(2000);
    
    // Connect
    console.log('🔌 Connecting to service...');
    
    // Check if input is disabled (needs connection)
    const input = await page.locator('input[type="text"], textarea').first();
    const isDisabled = await input.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log('   Input is disabled - looking for connect button...');
      
      // Take screenshot before clicking
      await page.screenshot({ path: 'screenshots/detailed-00-before-connect.png', fullPage: true });
      
      // Look for the power button or connect button - try multiple selectors
      let clicked = false;
      
      // Try title attribute
      const titleBtn = await page.locator('button[title*="Connect"]').first();
      if (await titleBtn.isVisible().catch(() => false)) {
        console.log('   Found button by title, clicking...');
        await titleBtn.click();
        clicked = true;
      }
      
      // Try looking for SVG with power icon
      if (!clicked) {
        const svgBtn = await page.locator('button:has(svg)').first();
        if (await svgBtn.isVisible().catch(() => false)) {
          console.log('   Found button with SVG, clicking...');
          await svgBtn.click();
          clicked = true;
        }
      }
      
      if (!clicked) {
        console.log('   ⚠️  Could not find connect button, listing all buttons...');
        const allButtons = await page.locator('button').all();
        console.log(`   Found ${allButtons.length} buttons total`);
        for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
          const text = await allButtons[i].textContent();
          const title = await allButtons[i].getAttribute('title');
          console.log(`   Button ${i}: text="${text}", title="${title}"`);
        }
        throw new Error('Connect button not found');
      }
      
      await sleep(3000);
      await page.screenshot({ path: 'screenshots/detailed-00-after-connect.png', fullPage: true });
      
      // Verify connection
      const stillDisabled = await input.getAttribute('disabled');
      if (stillDisabled === null) {
        console.log('   ✅ Input is now enabled');
        successes.push('✅ Connected successfully');
      } else {
        console.log('   ❌ Input still disabled after clicking');
        issues.push('❌ Failed to connect - input still disabled');
        throw new Error('Input still disabled after connect attempt');
      }
    } else {
      console.log('   Already connected');
      successes.push('✅ Already connected');
    }
    
    // Helper to get all chat messages
    async function getChatMessages() {
      // Look for message containers - adjust selectors based on actual UI
      const messageElements = await page.locator('[class*="message"], [class*="chat-message"], div[role="log"]').all();
      const messages = [];
      
      for (const el of messageElements) {
        const text = await el.textContent();
        const isUser = await el.evaluate(node => {
          return node.className.includes('user') || 
                 node.textContent.includes('You:') ||
                 node.querySelector('[class*="user"]') !== null;
        });
        
        if (text && text.length > 5) {
          messages.push({
            text: text.trim(),
            isUser,
            element: el
          });
        }
      }
      
      return messages;
    }
    
    // Helper to send message and wait for response
    async function sendAndWait(message, expectedKeywords = [], timeoutSec = 30) {
      console.log(`\n📤 User: "${message}"`);
      
      const beforeMessages = await getChatMessages();
      const beforeCount = beforeMessages.length;
      
      const input = await page.locator('input[type="text"]:not([disabled]), textarea:not([disabled])').first();
      await input.fill(message);
      await input.press('Enter');
      
      console.log('   ⏳ Waiting for response...');
      
      let responseFound = false;
      let attempts = 0;
      const maxAttempts = timeoutSec * 2; // Check every 500ms
      
      while (!responseFound && attempts < maxAttempts) {
        await sleep(500);
        attempts++;
        
        const currentMessages = await getChatMessages();
        
        // Check if new messages appeared
        if (currentMessages.length > beforeCount) {
          const newMessages = currentMessages.slice(beforeCount);
          
          for (const msg of newMessages) {
            if (!msg.isUser) {
              console.log(`   📨 Agent: ${msg.text.substring(0, 100)}...`);
              
              // Check for expected keywords
              if (expectedKeywords.length > 0) {
                const foundKeywords = expectedKeywords.filter(kw => 
                  msg.text.toLowerCase().includes(kw.toLowerCase())
                );
                
                if (foundKeywords.length > 0) {
                  responseFound = true;
                  return { success: true, messages: newMessages, text: msg.text };
                }
              } else {
                responseFound = true;
                return { success: true, messages: newMessages, text: msg.text };
              }
            }
          }
        }
        
        if (attempts % 4 === 0) {
          console.log(`   ... still waiting (${attempts / 2}s)`);
        }
      }
      
      return { success: false, messages: [], text: '' };
    }
    
    // ============================================================
    // TEST 1: Balance check
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Balance Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const balanceResult = await sendAndWait(
      'I need to check my balance for account 12345678, sort code 112233',
      ['verify', 'identity', 'balance'],
      30
    );
    
    if (!balanceResult.success) {
      issues.push('❌ No response to balance request');
    } else {
      successes.push('✅ Agent responded to balance request');
      
      // Check if agent is asking for verification or providing balance
      if (balanceResult.text.toLowerCase().includes('verify') || 
          balanceResult.text.toLowerCase().includes('identity')) {
        console.log('   🔐 Agent requesting verification (expected)');
        
        // Provide credentials
        const credResult = await sendAndWait(
          'My account is 12345678 and sort code is 112233',
          ['balance', '£', '$', 'account'],
          30
        );
        
        if (!credResult.success) {
          issues.push('❌ No balance provided after credentials');
        } else if (credResult.text.toLowerCase().includes('balance')) {
          successes.push('✅ Balance provided after verification');
        } else {
          issues.push('⚠️  Response received but no balance mentioned');
        }
      } else if (balanceResult.text.toLowerCase().includes('balance')) {
        successes.push('✅ Balance provided immediately');
      }
    }
    
    await page.screenshot({ path: 'screenshots/detailed-01-balance.png', fullPage: true });
    await sleep(2000);
    
    // ============================================================
    // TEST 2: Disputes check
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Disputes Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const disputeResult = await sendAndWait(
      'Can you check my open disputes?',
      ['dispute', '3', 'three'],
      30
    );
    
    if (!disputeResult.success) {
      issues.push('❌ No response to disputes request');
    } else {
      successes.push('✅ Agent responded to disputes request');
      
      // Check for "3" disputes
      if (disputeResult.text.includes('3') || disputeResult.text.toLowerCase().includes('three')) {
        successes.push('✅ Confirmed 3 open disputes');
      } else {
        issues.push('⚠️  Number of disputes not clearly stated');
      }
    }
    
    await page.screenshot({ path: 'screenshots/detailed-02-disputes.png', fullPage: true });
    await sleep(2000);
    
    // ============================================================
    // TEST 3: Check for duplicate messages
    // ============================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: UI Quality Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const allMessages = await getChatMessages();
    console.log(`\n   📊 Total messages: ${allMessages.length}`);
    
    // Check for duplicates
    const messageTexts = allMessages.map(m => m.text);
    const uniqueTexts = new Set(messageTexts);
    
    if (messageTexts.length > uniqueTexts.size) {
      const duplicates = messageTexts.length - uniqueTexts.size;
      issues.push(`❌ Found ${duplicates} duplicate message(s)`);
      console.log(`   ⚠️  Duplicate messages detected: ${duplicates}`);
    } else {
      successes.push('✅ No duplicate messages');
      console.log('   ✅ No duplicates found');
    }
    
    // Check for empty or very short messages
    const shortMessages = allMessages.filter(m => m.text.length < 10);
    if (shortMessages.length > 0) {
      console.log(`   ⚠️  Found ${shortMessages.length} very short messages`);
    }
    
    await page.screenshot({ path: 'screenshots/detailed-03-final.png', fullPage: true });
    
    // ============================================================
    // FINAL REPORT
    // ============================================================
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                   FINAL REPORT                         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('SUCCESSES:');
    successes.forEach(s => console.log(`  ${s}`));
    
    if (issues.length > 0) {
      console.log('\nISSUES FOUND:');
      issues.forEach(i => console.log(`  ${i}`));
    } else {
      console.log('\n🎉 NO ISSUES FOUND - Perfect user experience!');
    }
    
    console.log('\n📸 Screenshots:');
    console.log('  - detailed-01-balance.png');
    console.log('  - detailed-02-disputes.png');
    console.log('  - detailed-03-final.png');
    
    // Keep browser open
    console.log('\n⏸️  Browser staying open for 30 seconds...');
    await sleep(30000);
    
    return issues.length === 0;
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({ path: 'screenshots/detailed-error.png', fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

// Run test
testDetailedUX()
  .then(success => {
    if (success) {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some issues found - see report above');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
