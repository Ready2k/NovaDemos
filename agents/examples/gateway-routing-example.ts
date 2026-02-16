/**
 * Gateway Routing Example - Practical Usage
 * 
 * This example demonstrates how to use Gateway Routing in a real agent implementation.
 */

import { AgentCore, AgentCoreConfig } from '../src/agent-core';
import { GatewayRouter } from '../src/gateway-router';
import { ToolsClient } from '../src/tools-client';
import { DecisionEvaluator } from '../src/decision-evaluator';
import { GraphExecutor } from '../src/graph-executor';

/**
 * Example 1: Triage Agent routing to specialist agents
 */
class TriageAgent {
    private agentCore: AgentCore;
    private gatewayRouter: GatewayRouter;

    constructor(config: AgentCoreConfig) {
        this.agentCore = new AgentCore(config);
        
        // Get gateway router from agent core
        this.gatewayRouter = this.agentCore.getGatewayRouter()!;
    }

    /**
     * Process user intent and route to appropriate specialist
     */
    async processUserIntent(sessionId: string, userMessage: string): Promise<void> {
        console.log(`[TriageAgent] Processing: "${userMessage}"`);

        // Detect intent
        const intent = this.detectIntent(userMessage);
        console.log(`[TriageAgent] Detected intent: ${intent}`);

        // Route based on intent
        switch (intent) {
            case 'check_balance':
            case 'view_transactions':
                await this.routeToBanking(sessionId, intent, userMessage);
                break;

            case 'dispute_transaction':
                await this.routeToDisputes(sessionId, intent, userMessage);
                break;

            case 'mortgage_inquiry':
                await this.routeToMortgage(sessionId, intent, userMessage);
                break;

            default:
                console.log(`[TriageAgent] Unknown intent, staying in triage`);
        }
    }

    /**
     * Route to banking agent
     */
    private async routeToBanking(sessionId: string, intent: string, message: string): Promise<void> {
        console.log(`[TriageAgent] Routing to banking agent...`);

        const success = await this.agentCore.routeToAgentViaGateway(
            sessionId,
            'banking',
            {
                userIntent: intent,
                lastUserMessage: message
            }
        );

        if (success) {
            console.log(`[TriageAgent] ✅ Successfully routed to banking`);
        } else {
            console.log(`[TriageAgent] ❌ Failed to route to banking`);
        }
    }

    /**
     * Route to disputes agent
     */
    private async routeToDisputes(sessionId: string, intent: string, message: string): Promise<void> {
        console.log(`[TriageAgent] Routing to disputes agent...`);

        const success = await this.agentCore.routeToAgentViaGateway(
            sessionId,
            'disputes',
            {
                userIntent: intent,
                lastUserMessage: message
            }
        );

        if (success) {
            console.log(`[TriageAgent] ✅ Successfully routed to disputes`);
        } else {
            console.log(`[TriageAgent] ❌ Failed to route to disputes`);
        }
    }

    /**
     * Route to mortgage agent
     */
    private async routeToMortgage(sessionId: string, intent: string, message: string): Promise<void> {
        console.log(`[TriageAgent] Routing to mortgage agent...`);

        const success = await this.agentCore.routeToAgentViaGateway(
            sessionId,
            'mortgage',
            {
                userIntent: intent,
                lastUserMessage: message
            }
        );

        if (success) {
            console.log(`[TriageAgent] ✅ Successfully routed to mortgage`);
        } else {
            console.log(`[TriageAgent] ❌ Failed to route to mortgage`);
        }
    }

    /**
     * Simple intent detection (in production, use LLM or NLU)
     */
    private detectIntent(message: string): string {
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('balance')) return 'check_balance';
        if (lowerMessage.includes('transaction')) {
            if (lowerMessage.includes('dispute')) return 'dispute_transaction';
            return 'view_transactions';
        }
        if (lowerMessage.includes('mortgage') || lowerMessage.includes('loan')) return 'mortgage_inquiry';

        return 'unknown';
    }
}

/**
 * Example 2: IDV Agent routing to banking after verification
 */
class IDVAgent {
    private agentCore: AgentCore;

    constructor(config: AgentCoreConfig) {
        this.agentCore = new AgentCore(config);
    }

    /**
     * Verify user and route to banking
     */
    async verifyAndRoute(
        sessionId: string,
        account: string,
        sortCode: string
    ): Promise<void> {
        console.log(`[IDVAgent] Verifying user: ${account}, ${sortCode}`);

        // Simulate IDV check
        const verificationResult = await this.performIDVCheck(account, sortCode);

        if (verificationResult.verified) {
            console.log(`[IDVAgent] ✅ User verified: ${verificationResult.userName}`);

            // Route to banking with verified credentials
            const success = await this.agentCore.routeToAgentViaGateway(
                sessionId,
                'banking',
                {
                    verified: true,
                    userName: verificationResult.userName,
                    account: account,
                    sortCode: sortCode,
                    userIntent: 'check_balance' // Default intent after verification
                }
            );

            if (success) {
                console.log(`[IDVAgent] ✅ Successfully routed to banking`);
            } else {
                console.log(`[IDVAgent] ❌ Failed to route to banking`);
            }
        } else {
            console.log(`[IDVAgent] ❌ Verification failed`);
            // Stay in IDV agent for retry
        }
    }

    /**
     * Simulate IDV check
     */
    private async performIDVCheck(account: string, sortCode: string): Promise<any> {
        // In production, this would call actual IDV service
        return {
            verified: true,
            userName: 'John Smith',
            account: account,
            sortCode: sortCode
        };
    }
}

/**
 * Example 3: Banking Agent returning to triage after task completion
 */
class BankingAgent {
    private agentCore: AgentCore;

    constructor(config: AgentCoreConfig) {
        this.agentCore = new AgentCore(config);
    }

    /**
     * Complete banking task and return to triage
     */
    async completeTaskAndReturn(
        sessionId: string,
        taskType: string,
        result: any
    ): Promise<void> {
        console.log(`[BankingAgent] Task completed: ${taskType}`);

        // Route back to triage with task summary
        const success = await this.agentCore.routeToAgentViaGateway(
            sessionId,
            'triage',
            {
                taskCompleted: taskType,
                conversationSummary: `Completed ${taskType}: ${JSON.stringify(result)}`,
                lastAgent: 'banking'
            }
        );

        if (success) {
            console.log(`[BankingAgent] ✅ Successfully returned to triage`);
        } else {
            console.log(`[BankingAgent] ❌ Failed to return to triage`);
        }
    }
}

/**
 * Example 4: Using Gateway Router directly (without AgentCore)
 */
async function directGatewayRouting() {
    console.log('\n=== Direct Gateway Routing Example ===\n');

    const router = new GatewayRouter({
        gatewayUrl: 'http://localhost:8080',
        agentId: 'custom-agent',
        timeout: 5000
    });

    // Check available agents
    const agents = await router.getAvailableAgents();
    console.log('Available agents:', agents);

    // Route to banking
    const response = await router.routeToAgent({
        sessionId: 'example-session',
        targetAgentId: 'banking',
        context: {
            lastAgent: 'custom-agent',
            userIntent: 'check balance',
            verified: true,
            userName: 'Jane Doe',
            account: '87654321',
            sortCode: '65-43-21'
        },
        reason: 'User needs banking assistance'
    });

    if (response.success) {
        console.log('✅ Routing successful');
    } else {
        console.log('❌ Routing failed:', response.error);
    }
}

/**
 * Example 5: Conditional routing based on agent availability
 */
async function conditionalRouting() {
    console.log('\n=== Conditional Routing Example ===\n');

    const router = new GatewayRouter({
        gatewayUrl: 'http://localhost:8080',
        agentId: 'smart-router',
        timeout: 5000
    });

    const sessionId = 'conditional-session';
    const preferredAgent = 'banking';
    const fallbackAgent = 'triage';

    // Check if preferred agent is available
    const isAvailable = await router.isAgentAvailable(preferredAgent);

    let targetAgent = preferredAgent;
    if (!isAvailable) {
        console.log(`⚠️  ${preferredAgent} not available, using fallback: ${fallbackAgent}`);
        targetAgent = fallbackAgent;
    }

    // Route to selected agent
    const response = await router.routeToAgent({
        sessionId,
        targetAgentId: targetAgent,
        context: {
            userIntent: 'check balance',
            lastUserMessage: 'What is my balance?'
        },
        reason: `Routing to ${targetAgent}`
    });

    console.log(`Routed to ${targetAgent}:`, response.success ? '✅' : '❌');
}

/**
 * Example 6: Multi-step routing with state preservation
 */
async function multiStepRouting() {
    console.log('\n=== Multi-Step Routing Example ===\n');

    const router = new GatewayRouter({
        gatewayUrl: 'http://localhost:8080',
        agentId: 'orchestrator',
        timeout: 5000
    });

    const sessionId = 'multi-step-session';

    // Step 1: Route to IDV for verification
    console.log('Step 1: Routing to IDV...');
    await router.routeToAgent({
        sessionId,
        targetAgentId: 'idv',
        context: {
            userIntent: 'verify identity',
            lastUserMessage: 'I want to check my balance'
        },
        reason: 'User needs verification'
    });

    // Simulate IDV completion
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Update memory with verification result
    console.log('Step 2: Updating memory with verification...');
    // (This would normally be done by IDV agent)

    // Step 3: Route to banking with verified credentials
    console.log('Step 3: Routing to banking...');
    await router.routeToAgent({
        sessionId,
        targetAgentId: 'banking',
        context: {
            verified: true,
            userName: 'Alice Johnson',
            account: '11223344',
            sortCode: '11-22-33',
            userIntent: 'check balance',
            lastAgent: 'idv'
        },
        reason: 'User verified, proceeding to banking'
    });

    console.log('✅ Multi-step routing completed');
}

// Run examples
async function runExamples() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Gateway Routing Examples                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    try {
        await directGatewayRouting();
        await conditionalRouting();
        await multiStepRouting();

        console.log('\n✅ All examples completed successfully');
    } catch (error: any) {
        console.error('\n❌ Example failed:', error.message);
    }
}

// Run if executed directly
if (require.main === module) {
    runExamples().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export {
    TriageAgent,
    IDVAgent,
    BankingAgent,
    directGatewayRouting,
    conditionalRouting,
    multiStepRouting
};
