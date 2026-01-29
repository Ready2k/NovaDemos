"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRouter = void 0;
const redis_1 = require("redis");
class SessionRouter {
    constructor(redisUrl, registry) {
        this.SESSION_PREFIX = 'session:';
        this.redis = (0, redis_1.createClient)({ url: redisUrl });
        this.redis.on('error', (err) => console.error('[SessionRouter] Redis error:', err));
        this.registry = registry;
    }
    async connect() {
        await this.redis.connect();
        console.log('[SessionRouter] Connected to Redis');
    }
    async createSession(sessionId, initialAgent = 'triage') {
        const session = {
            sessionId,
            currentAgent: initialAgent,
            startTime: Date.now(),
            lastActivity: Date.now(),
            context: {
                // Initialize session memory
                verified: false,
                lastAgent: initialAgent
            }
        };
        await this.saveSession(session);
        console.log(`[SessionRouter] Created session ${sessionId} → ${initialAgent}`);
        return session;
    }
    async getSession(sessionId) {
        const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);
        if (!data)
            return null;
        return JSON.parse(data);
    }
    async saveSession(session) {
        session.lastActivity = Date.now();
        await this.redis.set(`${this.SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session), { EX: 3600 } // 1 hour TTL
        );
    }
    async routeToAgent(sessionId) {
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
    async transferSession(sessionId, toAgent, context) {
        const session = await this.getSession(sessionId);
        if (!session)
            return false;
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
    async deleteSession(sessionId) {
        await this.redis.del(`${this.SESSION_PREFIX}${sessionId}`);
        console.log(`[SessionRouter] Deleted session ${sessionId}`);
    }
    // Memory Management Methods
    async updateMemory(sessionId, memory) {
        const session = await this.getSession(sessionId);
        if (!session)
            return false;
        session.context = { ...session.context, ...memory };
        await this.saveSession(session);
        console.log(`[SessionRouter] Updated memory for ${sessionId}:`, Object.keys(memory));
        return true;
    }
    async getMemory(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session)
            return null;
        return session.context;
    }
    async close() {
        await this.redis.quit();
    }
}
exports.SessionRouter = SessionRouter;
