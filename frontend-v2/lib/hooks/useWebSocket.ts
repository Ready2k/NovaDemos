'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionStatus, WebSocketMessage } from '@/lib/types';

interface UseWebSocketOptions {
    url: string;
    autoConnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    onMessage?: (message: WebSocketMessage) => void;
}

interface UseWebSocketReturn {
    status: ConnectionStatus;
    connect: () => void;
    disconnect: () => void;
    send: (message: any) => void;
    sendBinary: (data: ArrayBuffer) => void;
    isConnected: boolean;
    isConnecting: boolean;
    lastMessage: WebSocketMessage | null;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
    const {
        url,
        autoConnect = false,
        reconnectInterval = 3000,
        maxReconnectAttempts = 5,
        onOpen,
        onClose,
        onError,
        onMessage,
    } = options;

    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const intentionalCloseRef = useRef(false);
    const hasConnectedRef = useRef(false); // Prevent double-connect in Strict Mode
    const connectRef = useRef<() => void>(() => { }); // Ref to handle recursive calls

    // Send JSON message
    const send = useCallback((message: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.warn('[WebSocket] Cannot send message, not connected');
        }
    }, []);

    // Send binary data (for audio)
    const sendBinary = useCallback((data: ArrayBuffer) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            // Check for ArrayBuffer or ArrayBufferView (TypedArray)
            if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                let buffer: ArrayBuffer;
                if (ArrayBuffer.isView(data)) {
                    buffer = data.buffer as ArrayBuffer;
                } else {
                    buffer = data;
                }

                const byteLength = buffer.byteLength;

                // Nova Sonic requires even byte length (16-bit PCM = 2 bytes per sample)
                if (byteLength % 2 !== 0) {
                    console.warn(`[WebSocket] Padding odd-sized binary payload: ${byteLength} -> ${byteLength + 1} bytes`);
                    const padded = new Uint8Array(byteLength + 1);
                    padded.set(new Uint8Array(buffer));
                    padded[byteLength] = 0; // Pad with zero
                    wsRef.current.send(padded.buffer);
                } else {
                    // console.log(`[WebSocket] Sending binary payload: ${byteLength} bytes`);
                    wsRef.current.send(data);
                }
            } else {
                wsRef.current.send(data);
            }
        } else {
            console.warn('[WebSocket] Cannot send binary data, not connected');
        }
    }, []);

    const onOpenRef = useRef(onOpen);
    const onCloseRef = useRef(onClose);
    const onErrorRef = useRef(onError);
    const onMessageRef = useRef(onMessage);

    useEffect(() => {
        onOpenRef.current = onOpen;
        onCloseRef.current = onClose;
        onErrorRef.current = onError;
        onMessageRef.current = onMessage;
    }, [onOpen, onClose, onError, onMessage]);

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[WebSocket] Already connected');
            return;
        }

        console.log('[WebSocket] Connecting to', url);
        setStatus('connecting');
        intentionalCloseRef.current = false;

        try {
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[WebSocket] Connected');
                setStatus('connected');
                reconnectAttemptsRef.current = 0;
                onOpenRef.current?.();
            };

            ws.onclose = (event) => {
                console.log('[WebSocket] Disconnected', event.code, event.reason);
                setStatus('disconnected');
                wsRef.current = null;
                onCloseRef.current?.();

                // Auto-reconnect if not intentional close
                if (!intentionalCloseRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    reconnectAttemptsRef.current++;
                    console.log(`[WebSocket] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (connectRef.current) connectRef.current();
                    }, reconnectInterval);
                } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                    console.error('[WebSocket] Max reconnection attempts reached');
                }
            };

            ws.onerror = (error) => {
                console.error('[WebSocket] Error', error);
                onErrorRef.current?.(error);
            };

            ws.onmessage = (event) => {
                try {
                    console.log('[WebSocket] Raw message received, type:', typeof event.data, 'instanceof ArrayBuffer:', event.data instanceof ArrayBuffer);
                    
                    // Handle binary data (could be audio OR text)
                    if (event.data instanceof ArrayBuffer) {
                        // Try to decode as text first
                        try {
                            const text = new TextDecoder().decode(event.data);
                            const message = JSON.parse(text);
                            console.log('[WebSocket] Decoded ArrayBuffer as JSON:', message.type);
                            setLastMessage(message);
                            onMessageRef.current?.(message);
                            return;
                        } catch (e) {
                            // Not JSON, treat as audio
                            const message: WebSocketMessage = {
                                type: 'audio',
                                audio: event.data,
                            };
                            setLastMessage(message);
                            onMessageRef.current?.(message);
                            return;
                        }
                    }

                    // Handle JSON data (string)
                    console.log('[WebSocket] Parsing as JSON:', event.data);
                    const message = JSON.parse(event.data);
                    setLastMessage(message);
                    onMessageRef.current?.(message);
                } catch (error) {
                    console.error('[WebSocket] Error parsing message', error, 'Data:', event.data);
                }
            };
        } catch (error) {
            console.error('[WebSocket] Connection failed', error);
            setStatus('disconnected');
        }
    }, [url, reconnectInterval, maxReconnectAttempts]);

    // Update ref whenever connect changes
    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        console.log('[WebSocket] Disconnecting...');
        intentionalCloseRef.current = true;

        // Clear reconnect timeout
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // Close WebSocket
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setStatus('disconnected');
    }, []);

    // Auto-connect on mount if enabled
    useEffect(() => {
        if (autoConnect) {
            // Prevent double-connect in React Strict Mode
            if (hasConnectedRef.current) {
                console.log('[WebSocket] Already connected, skipping duplicate mount');
                return;
            }
            hasConnectedRef.current = true;
            connect();
        }

        // Cleanup on unmount
        return () => {
            // In development, React Strict Mode will unmount/remount components
            // Don't close the WebSocket on the first unmount (it will remount immediately)
            // Only close if intentionalClose is set or if we're in production
            const isProduction = process.env.NODE_ENV === 'production';

            if (isProduction || intentionalCloseRef.current) {
                intentionalCloseRef.current = true;
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                }
                if (wsRef.current) {
                    wsRef.current.close();
                }
            } else {
                // Development: Don't close WebSocket, just clean up timeout
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                }
            }
        };
    }, [autoConnect, connect]);

    return {
        status,
        connect,
        disconnect,
        send,
        sendBinary,
        isConnected: status === 'connected' || status === 'recording',
        isConnecting: status === 'connecting',
        lastMessage,
    };
}
