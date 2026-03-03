/**
 * sbc-event-bridge.ts — Thin HTTP client that pushes SBC lifecycle events to
 * the main backend, which fans them out to all connected browser WebSocket clients.
 *
 * All emit() calls are non-fatal: if the main backend is unreachable the SBC
 * continues to function normally, just without live frontend visibility.
 */

export class SbcEventBridge {
    private backendUrl: string;

    constructor() {
        this.backendUrl = process.env.SBC_BACKEND_URL || 'http://localhost:8080';
    }

    async emit(event: object): Promise<void> {
        try {
            await fetch(`${this.backendUrl}/internal/sbc-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                signal: AbortSignal.timeout(2000),
            });
        } catch {
            // Non-fatal — frontend is optional for SBC operation
        }
    }
}
