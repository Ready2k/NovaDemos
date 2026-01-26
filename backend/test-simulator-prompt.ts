
require('dotenv').config();
import { SimulationService } from './src/simulation-service';

async function testSimulatorPrompt() {
    console.log("Loading SimulationService...");
    const service = new SimulationService();
    console.log("--- Test 1: Agent says 'Let me check' ---");
    const history1 = [
        { role: 'assistant', content: "Hello, how can I help?" },
        { role: 'user', content: "I have a fraud issue." },
        { role: 'assistant', content: "Let me check that for you. One moment." }
    ];
    // Simulator (User) should say [WAIT]
    // We expect the prompt logic to see the "processing" language and output [WAIT].
    // Note: The prompt instruction says "If the Agent says 'Let me check'... output '[WAIT]'".
    // "Agent" in the prompt corresponds to the role 'user' in the history passed to Bedrock (inverted), 
    // but SimulationService handles the inversion.
    // In SimulationService:
    // history.forEach(msg => { role = msg.role === 'assistant' ? 'user' : 'assistant'; ... })
    // So 'assistant' in history -> 'user' in Bedrock messages.
    // The prompt says: "CRITICAL: If the Agent says..." (Agent = User in Bedrock context).

    const response1 = await service.generateResponse(history1, "You are a customer complaining about fraud.");
    console.log("Response 1:", response1);

    if (response1.includes("[WAIT]")) {
        console.log("✅ PASS: Simulator waited.");
    } else {
        console.log("❌ FAIL: Simulator did not wait.");
    }

    console.log("\n--- Test 2: Agent asks a question ---");
    const history2 = [
        { role: 'assistant', content: "What is your account number?" }
    ];
    const response2 = await service.generateResponse(history2, "You are a customer, account 12345.");
    console.log("Response 2:", response2);
}

testSimulatorPrompt();
