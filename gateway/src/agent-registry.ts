import { createClient, RedisClientType } from 'redis';

export interface AgentInfo {
    id: string;
    url: string;
    status: 'healthy' | 'unhealthy' | 'starting';
    capabilities: string[];
    lastHeartbeat: number;
    port: number;
}

export class AgentRegistry {
    private redis: RedisClientType;
    private readonly REGISTRY_KEY = 'agent:registry';
    private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds

    constructor(redisUrl: string) {
        this.redis = createClient({ url: redisUrl });
        this.redis.on('error', (err) => console.error('[AgentRegistry] Redis error:', err));
    }

    async connect() {
        await this.redis.connect();
        console.log('[AgentRegistry] Connected to Redis');
    }

    async registerAgent(agent: AgentInfo): Promise<void> {
        const agentData = {
            ...agent,
            lastHeartbeat: Date.now()
        };
        await this.redis.hSet(this.REGISTRY_KEY, agent.id, JSON.stringify(agentData));
        console.log(`[AgentRegistry] Registered agent: ${agent.id} at ${agent.url}`);
    }

    async updateHeartbeat(agentId: string): Promise<void> {
        const agentData = await this.getAgent(agentId);
        if (agentData) {
            agentData.lastHeartbeat = Date.now();
            agentData.status = 'healthy';
            await this.redis.hSet(this.REGISTRY_KEY, agentId, JSON.stringify(agentData));
        }
    }

    async getAgent(agentId: string): Promise<AgentInfo | null> {
        const data = await this.redis.hGet(this.REGISTRY_KEY, agentId);
        if (!data) return null;
        return JSON.parse(data);
    }

    async getAllAgents(): Promise<AgentInfo[]> {
        const allData = await this.redis.hGetAll(this.REGISTRY_KEY);
        return Object.values(allData).map(d => JSON.parse(d));
    }

    async getHealthyAgents(): Promise<AgentInfo[]> {
        const agents = await this.getAllAgents();
        const now = Date.now();
        return agents.filter(agent => {
            const isRecent = (now - agent.lastHeartbeat) < this.HEARTBEAT_TIMEOUT;
            return agent.status === 'healthy' && isRecent;
        });
    }

    async findAgentByCapability(capability: string): Promise<AgentInfo | null> {
        const agents = await this.getHealthyAgents();
        return agents.find(agent => agent.capabilities.includes(capability)) || null;
    }

    async unregisterAgent(agentId: string): Promise<void> {
        await this.redis.hDel(this.REGISTRY_KEY, agentId);
        console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    }

    async close() {
        await this.redis.quit();
    }
}
