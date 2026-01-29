"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistry = void 0;
const redis_1 = require("redis");
class AgentRegistry {
    constructor(redisUrl) {
        this.REGISTRY_KEY = 'agent:registry';
        this.HEARTBEAT_TIMEOUT = 30000; // 30 seconds
        this.redis = (0, redis_1.createClient)({ url: redisUrl });
        this.redis.on('error', (err) => console.error('[AgentRegistry] Redis error:', err));
    }
    async connect() {
        await this.redis.connect();
        console.log('[AgentRegistry] Connected to Redis');
    }
    async registerAgent(agent) {
        const agentData = {
            ...agent,
            lastHeartbeat: Date.now()
        };
        await this.redis.hSet(this.REGISTRY_KEY, agent.id, JSON.stringify(agentData));
        console.log(`[AgentRegistry] Registered agent: ${agent.id} at ${agent.url}`);
    }
    async updateHeartbeat(agentId) {
        const agentData = await this.getAgent(agentId);
        if (agentData) {
            agentData.lastHeartbeat = Date.now();
            agentData.status = 'healthy';
            await this.redis.hSet(this.REGISTRY_KEY, agentId, JSON.stringify(agentData));
        }
    }
    async getAgent(agentId) {
        const data = await this.redis.hGet(this.REGISTRY_KEY, agentId);
        if (!data)
            return null;
        return JSON.parse(data);
    }
    async getAllAgents() {
        const allData = await this.redis.hGetAll(this.REGISTRY_KEY);
        return Object.values(allData).map(d => JSON.parse(d));
    }
    async getHealthyAgents() {
        const agents = await this.getAllAgents();
        const now = Date.now();
        return agents.filter(agent => {
            const isRecent = (now - agent.lastHeartbeat) < this.HEARTBEAT_TIMEOUT;
            return agent.status === 'healthy' && isRecent;
        });
    }
    async findAgentByCapability(capability) {
        const agents = await this.getHealthyAgents();
        return agents.find(agent => agent.capabilities.includes(capability)) || null;
    }
    async unregisterAgent(agentId) {
        await this.redis.hDel(this.REGISTRY_KEY, agentId);
        console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    }
    async close() {
        await this.redis.quit();
    }
}
exports.AgentRegistry = AgentRegistry;
