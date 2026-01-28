import { AgentRegistry, AgentInfo } from './agent-registry';
import { createClient, RedisClientType } from 'redis';

export interface SessionInfo {
    sessionId: string;
    currentAgent: string;
    userId?: string;
    startTime: number;
    lastActivity: number;
    context: Record<string, any>;
}

export class SessionRouter {
    private redis: RedisClientType;
    private registry: AgentRegistry;
    private readonly SESSION_PREFIX = 'session:';

    constructor(redisUrl: string, registry: AgentRegistry) {
        this.redis = createClient({ url: redisUrl });
        this.redis.on('error', (err) => console.error('[SessionRouter] Redis error:', err));
        this.registry = registry;
    }

    async connect() {
        await this.redis.connect();
        console.log('[SessionRouter] Connected to Redis');
    }

    async createSession(sessionId: string, initialAgent: string = 'triage'): Promise<SessionInfo> {
        const session: SessionInfo = {
            sessionId,
            currentAgent: initialAgent,
            startTime: Date.now(),
            lastActivity: Date.now(),
            context: {}
        };

        await this.saveSession(session);
        console.log(`[SessionRouter] Created session ${sessionId} → ${initialAgent}`);
        return session;
    }

    async getSession(sessionId: string): Promise<SessionInfo | null> {
        const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async saveSession(session: SessionInfo): Promise<void> {
        session.lastActivity = Date.now();
        await this.redis.set(
            `${this.SESSION_PREFIX}${session.sessionId}`,
            JSON.stringify(session),
            { EX: 3600 } // 1 hour TTL
        );
    }

    async routeToAgent(sessionId: string): Promise<AgentInfo | null> {
        const session = await this.getSession(sessionId);
        if (!session) {
            console.warn(`[SessionRouter] Session not found: ${sessionId}`);
            return null;
        }

        const agent = await this.registry.getAgent(session.currentAgent);
        if (!agent || agent.status !== 'healthy') {
            console.warn(`[SessionRouter] Agent ${session.currentAgent} not healthy, falling back to triage`);
            // Fallback to triage
            const triageAgent = await this.registry.getAgent('triage');
            if (triageAgent) {
                session.currentAgent = 'triage';
                await this.saveSession(session);
                return triageAgent;
            }
            return null;
        }

        return agent;
    }

    async transferSession(sessionId: string, toAgent: string, context?: Record<string, any>): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        const targetAgent = await this.registry.getAgent(toAgent);
        if (!targetAgent || targetAgent.status !== 'healthy') {
            console.error(`[SessionRouter] Cannot transfer to unhealthy agent: ${toAgent}`);
            return false;
        }

        session.currentAgent = toAgent;
        if (context) {
            session.context = { ...session.context, ...context };
        }

        await this.saveSession(session);
        console.log(`[SessionRouter] Transferred session ${sessionId} → ${toAgent}`);
        return true;
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.redis.del(`${this.SESSION_PREFIX}${sessionId}`);
        console.log(`[SessionRouter] Deleted session ${sessionId}`);
    }

    async close() {
        await this.redis.quit();
    }
}
