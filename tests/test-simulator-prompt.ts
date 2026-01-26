
import { SimulationService } from '../backend/src/simulation-service';

async function testSimulatorPrompt() {
    const service = new SimulationService();
    console.log("--- Test 1: Agent says 'Let me check' ---");
    const history1 = [
        { role: 'assistant', content: "Hello, how can I help?" },
        { role: 'user', content: "I have a fraud issue." },
        { role: 'assistant', content: "Let me check that for you. One moment." }
    ];
    // Simulator (User) should say [WAIT]
    const response1 = await service.generateResponse(history1, "You are a customer complaining about fraud.");
    console.log("Response 1:", response1);

    console.log("\n--- Test 2: Agent asks a question ---");
    const history2 = [
        { role: 'assistant', content: "What is your account number?" }
    ];
    const response2 = await service.generateResponse(history2, "You are a customer, account 12345.");
    console.log("Response 2:", response2);
}

testSimulatorPrompt();
