/**
 * Mock WebSocket for Testing
 * 
 * This mock implementation provides a testable version of WebSocket
 * that tracks sent messages and supports event handlers.
 * 
 * Validates: Requirement 13.3 - Testing Support
 */

/**
 * Mock WebSocket for testing text and voice interactions
 * Implements the same interface as WebSocket but with tracking capabilities
 */
export class MockWebSocket {
    // State tracking
    public readyState: number = 1; // OPEN (WebSocket.OPEN)
    public sentMessages: (Buffer | string)[] = [];
    public sendCalled: number = 0;
    public closeCalled: number = 0;
    public closeCode?: number;
    public closeReason?: string;

    // Event handlers
    private eventHandlers: Map<string, Function[]> = new Map();

    // Error simulation
    public shouldFailOnSend: boolean = false;
    public shouldFailOnClose: boolean = false;
    public sendErrorMessage: string = 'Failed to send message';

    /**
     * Send a message
     * Tracks all sent messages
     */
    send(data: Buffer | string): void {
        this.sendCalled++;
        
        if (this.readyState !== 1) {
            throw new Error('WebSocket is not open');
        }
        
        if (this.shouldFailOnSend) {
            throw new Error(this.sendErrorMessage);
        }
        
        this.sentMessages.push(data);
    }

    /**
     * Close the WebSocket
     * Updates state and triggers close handlers
     */
    close(code?: number, reason?: string): void {
        this.closeCalled++;
        
        if (this.shouldFailOnClose) {
            throw new Error('Failed to close WebSocket');
        }
        
        this.readyState = 3; // CLOSED (WebSocket.CLOSED)
        this.closeCode = code;
        this.closeReason = reason;
        
        // Trigger close event handlers
        this.triggerEvent('close', { code, reason });
    }

    /**
     * Register an event handler
     * Supports: 'message', 'close', 'error', 'open'
     */
    on(event: string, handler: Function): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event)!.push(handler);
    }

    /**
     * Register a one-time event handler
     */
    once(event: string, handler: Function): void {
        const wrappedHandler = (...args: any[]) => {
            handler(...args);
            this.off(event, wrappedHandler);
        };
        this.on(event, wrappedHandler);
    }

    /**
     * Remove an event handler
     */
    off(event: string, handler: Function): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Trigger an event
     * Calls all registered handlers for the event
     */
    triggerEvent(event: string, data?: any): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }

    /**
     * Simulate receiving a message
     * Triggers message event handlers
     */
    receiveMessage(data: Buffer | string): void {
        if (this.readyState !== 1) {
            throw new Error('WebSocket is not open');
        }
        
        // Convert string to Buffer to match real WebSocket behavior
        const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
        
        this.triggerEvent('message', bufferData);
    }

    /**
     * Simulate an error
     * Triggers error event handlers
     */
    simulateError(error: Error): void {
        this.triggerEvent('error', error);
    }

    /**
     * Simulate connection open
     * Triggers open event handlers
     */
    simulateOpen(): void {
        this.readyState = 1; // OPEN
        this.triggerEvent('open', {});
    }

    /**
     * Get all sent messages as strings
     * Converts Buffer messages to strings
     */
    getSentMessagesAsStrings(): string[] {
        return this.sentMessages.map(msg => {
            if (Buffer.isBuffer(msg)) {
                return msg.toString('utf-8');
            }
            return msg;
        });
    }

    /**
     * Get all sent JSON messages
     * Parses string messages as JSON
     */
    getSentJsonMessages(): any[] {
        return this.sentMessages
            .filter(msg => typeof msg === 'string' || (Buffer.isBuffer(msg) && msg.length > 0))
            .map(msg => {
                try {
                    const str = Buffer.isBuffer(msg) ? msg.toString('utf-8') : msg;
                    return JSON.parse(str);
                } catch (error) {
                    return null;
                }
            })
            .filter(msg => msg !== null);
    }

    /**
     * Get all sent binary messages
     * Returns only Buffer messages
     */
    getSentBinaryMessages(): Buffer[] {
        return this.sentMessages.filter(msg => Buffer.isBuffer(msg)) as Buffer[];
    }

    /**
     * Find sent messages by type
     * Searches JSON messages for a specific type field
     */
    findMessagesByType(type: string): any[] {
        return this.getSentJsonMessages().filter(msg => msg.type === type);
    }

    /**
     * Get last sent message
     */
    getLastMessage(): Buffer | string | undefined {
        return this.sentMessages[this.sentMessages.length - 1];
    }

    /**
     * Get last sent JSON message
     */
    getLastJsonMessage(): any | undefined {
        const jsonMessages = this.getSentJsonMessages();
        return jsonMessages[jsonMessages.length - 1];
    }

    /**
     * Check if a message with specific type was sent
     */
    hasMessageType(type: string): boolean {
        return this.findMessagesByType(type).length > 0;
    }

    /**
     * Count messages by type
     */
    countMessagesByType(type: string): number {
        return this.findMessagesByType(type).length;
    }

    /**
     * Reset all tracking data
     * Useful for test cleanup
     */
    reset(): void {
        this.readyState = 1; // OPEN
        this.sentMessages = [];
        this.sendCalled = 0;
        this.closeCalled = 0;
        this.closeCode = undefined;
        this.closeReason = undefined;
        this.eventHandlers.clear();
        this.shouldFailOnSend = false;
        this.shouldFailOnClose = false;
    }

    /**
     * Check if WebSocket is open
     */
    isOpen(): boolean {
        return this.readyState === 1;
    }

    /**
     * Check if WebSocket is closed
     */
    isClosed(): boolean {
        return this.readyState === 3;
    }

    /**
     * Get total bytes sent
     * Calculates total size of all sent messages
     */
    getTotalBytesSent(): number {
        return this.sentMessages.reduce((total, msg) => {
            if (Buffer.isBuffer(msg)) {
                return total + msg.length;
            }
            return total + Buffer.byteLength(msg, 'utf-8');
        }, 0);
    }

    /**
     * Wait for a specific message type
     * Returns a promise that resolves when the message is sent
     */
    waitForMessageType(type: string, timeout: number = 1000): Promise<any> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                const messages = this.findMessagesByType(type);
                if (messages.length > 0) {
                    clearInterval(checkInterval);
                    resolve(messages[messages.length - 1]);
                }
                
                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error(`Timeout waiting for message type: ${type}`));
                }
            }, 10);
        });
    }
}

/**
 * WebSocket state constants
 * Matches the WebSocket API constants
 */
export const WebSocketState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
} as const;
