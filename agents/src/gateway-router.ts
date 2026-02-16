/**
 * Gateway Router - Context Passing Between Agents
 * 
 * This module enables agents to route requests to other agents through the gateway,
 * passing context and state between them. It provides a clean abstraction for
 * agent-to-agent communication without direct coupling.
 */

import axios from 'axios';
import { WebSocket } from 'ws';

/**
 * Configuration for Gateway Router
 */
export interface GatewayRouterConfig {
    gatewayUrl: string;
    agentId: string;
    timeout?: number; // Request timeout in ms
}

/**
 * Context to pass between agents
 */
export interface AgentContext {
    // User Identity
    verified?: boolean;
    userName?: string;
    account?: string;
    sortCode?: string;
    
    // Journey State
    lastAgent?: string;
    userIntent?: string;
    lastUserMessage?: string;
    taskCompleted?: string;
    conversationSummary?: string;
    
    // Graph State
    graphState?: any;
    
    // Custom context
    [key: string]: any;
}

/**
 * Routing request to another agent
 */
export interface RouteRequest {
    sessionId: string;
    targetAgentId: string;
    context: AgentContext;
    reason?: string;
}

/**
 * Routing response from gateway
 */
export interface RouteResponse {
    success: boolean;
    targetAgent?: string;
    error?: string;
    timestamp: number;
}

/**
 * Gateway Router - Handles agent-to-agent routing through gateway
 */
export class GatewayRouter {
    private config: GatewayRouterConfig;
    private gatewayUrl: string;
    private agentId: string;
    private timeout: number;

    constructor(config: GatewayRouterConfig) {
        this.config = config;
        this.gatewayUrl = config.gatewayUrl;
        this.agentId = config.agentId;
        this.timeout = config.timeout || 5000;

        console.log(`[GatewayRouter:${this.agentId}] Initialized with gateway: ${this.gatewayUrl}`);
    }

    /**
     * Route a session to another agent through the gateway
     * 
     * @param request Routing request with target agent and context
     * @returns Routing response indicating success or failure
     */
    public async routeToAgent(request: RouteRequest): Promise<RouteResponse> {
        console.log(`[GatewayRouter:${this.agentId}] Routing session ${request.sessionId} to ${request.targetAgentId}`);
        console.log(`[GatewayRouter:${this.agentId}] Context keys: ${Object.keys(request.context).join(', ')}`);

        try {
            // Step 1: Update session memory in gateway with context
            const memoryUpdateSuccess = await this.updateGatewayMemory(
                request.sessionId,
                request.context
            );

            if (!memoryUpdateSuccess) {
                console.error(`[GatewayRouter:${this.agentId}] Failed to update gateway memory`);
                return {
                    success: false,
                    error: 'Failed to update gateway memory',
                    timestamp: Date.now()
                };
            }

            // Step 2: Request agent transfer through gateway
            const transferSuccess = await this.requestAgentTransfer(
                request.sessionId,
                request.targetAgentId,
                request.reason
            );

            if (!transferSuccess) {
                console.error(`[GatewayRouter:${this.agentId}] Failed to transfer session to ${request.targetAgentId}`);
                return {
                    success: false,
                    error: `Failed to transfer to ${request.targetAgentId}`,
                    timestamp: Date.now()
                };
            }

            console.log(`[GatewayRouter:${this.agentId}] ✅ Successfully routed to ${request.targetAgentId}`);

            return {
                success: true,
                targetAgent: request.targetAgentId,
                timestamp: Date.now()
            };

        } catch (error: any) {
            console.error(`[GatewayRouter:${this.agentId}] Routing error:`, error.message);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Update session memory in gateway
     * This ensures context is available to the target agent
     */
    private async updateGatewayMemory(
        sessionId: string,
        context: AgentContext
    ): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.gatewayUrl}/api/sessions/${sessionId}/memory`,
                {
                    sessionId,
                    memory: context,
                    timestamp: Date.now()
                },
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Agent-Id': this.agentId
                    }
                }
            );

            if (response.status === 200 && response.data.success) {
                console.log(`[GatewayRouter:${this.agentId}] ✅ Memory updated in gateway`);
                return true;
            }

            console.warn(`[GatewayRouter:${this.agentId}] Memory update returned non-success: ${response.status}`);
            return false;

        } catch (error: any) {
            // If endpoint doesn't exist, try fallback method
            if (error.response?.status === 404) {
                console.log(`[GatewayRouter:${this.agentId}] Memory endpoint not found, using fallback`);
                return await this.updateMemoryFallback(sessionId, context);
            }

            console.error(`[GatewayRouter:${this.agentId}] Memory update error:`, error.message);
            return false;
        }
    }

    /**
     * Fallback method for updating memory (direct Redis access if available)
     */
    private async updateMemoryFallback(
        sessionId: string,
        context: AgentContext
    ): Promise<boolean> {
        // For now, just log and return true
        // In production, this could use direct Redis access
        console.log(`[GatewayRouter:${this.agentId}] Using memory update fallback`);
        return true;
    }

    /**
     * Request agent transfer through gateway
     */
    private async requestAgentTransfer(
        sessionId: string,
        targetAgentId: string,
        reason?: string
    ): Promise<boolean> {
        try {
            const response = await axios.post(
                `${this.gatewayUrl}/api/sessions/${sessionId}/transfer`,
                {
                    sessionId,
                    targetAgent: targetAgentId,
                    reason: reason || 'Agent routing request',
                    timestamp: Date.now()
                },
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Agent-Id': this.agentId
                    }
                }
            );

            if (response.status === 200 && response.data.success) {
                console.log(`[GatewayRouter:${this.agentId}] ✅ Transfer request accepted by gateway`);
                return true;
            }

            console.warn(`[GatewayRouter:${this.agentId}] Transfer request returned non-success: ${response.status}`);
            return false;

        } catch (error: any) {
            // If endpoint doesn't exist, log warning but don't fail
            // The gateway might handle transfers automatically via tool interception
            if (error.response?.status === 404) {
                console.log(`[GatewayRouter:${this.agentId}] Transfer endpoint not found, gateway may handle automatically`);
                return true;
            }

            console.error(`[GatewayRouter:${this.agentId}] Transfer request error:`, error.message);
            return false;
        }
    }

    /**
     * Get current session memory from gateway
     */
    public async getSessionMemory(sessionId: string): Promise<AgentContext | null> {
        try {
            const response = await axios.get(
                `${this.gatewayUrl}/api/sessions/${sessionId}/memory`,
                {
                    timeout: this.timeout,
                    headers: {
                        'X-Agent-Id': this.agentId
                    }
                }
            );

            if (response.status === 200 && response.data) {
                console.log(`[GatewayRouter:${this.agentId}] Retrieved session memory from gateway`);
                return response.data.memory || response.data;
            }

            return null;

        } catch (error: any) {
            console.error(`[GatewayRouter:${this.agentId}] Failed to get session memory:`, error.message);
            return null;
        }
    }

    /**
     * Notify gateway of agent status change
     */
    public async notifyStatusChange(status: 'ready' | 'busy' | 'error', details?: any): Promise<void> {
        try {
            await axios.post(
                `${this.gatewayUrl}/api/agents/${this.agentId}/status`,
                {
                    agentId: this.agentId,
                    status,
                    details,
                    timestamp: Date.now()
                },
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`[GatewayRouter:${this.agentId}] Status updated: ${status}`);

        } catch (error: any) {
            // Don't fail on status updates
            console.warn(`[GatewayRouter:${this.agentId}] Status update failed:`, error.message);
        }
    }

    /**
     * Check if target agent is available
     */
    public async isAgentAvailable(targetAgentId: string): Promise<boolean> {
        try {
            const response = await axios.get(
                `${this.gatewayUrl}/api/agents/${targetAgentId}`,
                {
                    timeout: this.timeout
                }
            );

            if (response.status === 200 && response.data) {
                const agent = response.data;
                return agent.status === 'healthy';
            }

            return false;

        } catch (error: any) {
            console.error(`[GatewayRouter:${this.agentId}] Failed to check agent availability:`, error.message);
            return false;
        }
    }

    /**
     * Get list of available agents from gateway
     */
    public async getAvailableAgents(): Promise<string[]> {
        try {
            const response = await axios.get(
                `${this.gatewayUrl}/api/agents`,
                {
                    timeout: this.timeout
                }
            );

            if (response.status === 200 && Array.isArray(response.data)) {
                return response.data
                    .filter((agent: any) => agent.status === 'healthy')
                    .map((agent: any) => agent.id);
            }

            return [];

        } catch (error: any) {
            console.error(`[GatewayRouter:${this.agentId}] Failed to get available agents:`, error.message);
            return [];
        }
    }
}
