
import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../types';

interface UseWorkflowSimulatorProps {
    isActive: boolean;
    isConnected: boolean;
    messages: Message[];
    onSendMessage: (text: string) => void;
    testPersona?: string;
    testInstructions?: string; // Add this
    stopSimulation: () => void;
}

export function useWorkflowSimulator({ isActive, isConnected, messages, onSendMessage, testPersona, testInstructions, stopSimulation }: UseWorkflowSimulatorProps) {
    const [isThinking, setIsThinking] = useState(false);
    const waitingForEcho = useRef(false);
    const lastMessageCount = useRef(messages.length);

    // Reset waiting state if messages length changes
    useEffect(() => {
        if (messages.length > lastMessageCount.current) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'user') {
                waitingForEcho.current = false;
            }
        }
        lastMessageCount.current = messages.length;
    }, [messages]);

    // Default persona if none provided
    const effectivePersona = testPersona || "You are a helpful user testing the system.";

    useEffect(() => {
        if (!isActive || !isConnected || isThinking || waitingForEcho.current) return;

        // CRITICAL: Wait for the Agent to greet first (don't speak if messages is empty)
        if (messages.length === 0) {
            return;
        }

        const lastMessage = messages[messages.length - 1];

        // If last message was from User, it's the Agent's turn. We wait.
        if (lastMessage && lastMessage.role === 'user') {
            // Safety reset if we were waiting for echo and it arrived
            waitingForEcho.current = false;
            return;
        }

        // We delay slightly to simulate thinking and not hammer the server.
        const timeoutId = setTimeout(async () => {
            // Re-check conditions inside timeout
            if (isThinking || waitingForEcho.current || !isActive) return;

            // Double check messages haven't updated in the interim
            const currentLast = messages[messages.length - 1];
            if (!currentLast || currentLast.role === 'user') return;

            // Generate Response
            setIsThinking(true);
            try {
                // Prepare history for API
                // Map frontend messages to { role, content }
                const history = messages.map(m => ({
                    role: m.role,
                    content: m.content || ''
                }));

                const res = await fetch('http://localhost:8080/api/simulation/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        history,
                        persona: effectivePersona,
                        instructions: testInstructions // Pass additional instructions
                    })
                });

                if (!res.ok) throw new Error("Simulation API failed");
                const data = await res.json();

                if (data.response) {
                    let text = data.response;
                    let isDone = false;

                    if (text.includes('[DONE]')) {
                        text = text.replace('[DONE]', '').trim();
                        isDone = true;
                    }

                    onSendMessage(text);
                    waitingForEcho.current = true; // Mark as waiting for transcript update

                    if (isDone) {
                        console.log('[Simulator] Objective achieved. Terminating simulation...');
                        setTimeout(() => {
                            stopSimulation();
                        }, 1500); // Small delay to let the final message be sent/seen
                    }
                }

            } catch (e) {
                console.error("Simulation error:", e);
                stopSimulation(); // Auto-stop on error
            } finally {
                setIsThinking(false);
            }
        }, 1000); // 1s delay for realism

        return () => clearTimeout(timeoutId);

    }, [isActive, isConnected, messages, effectivePersona, isThinking, onSendMessage, stopSimulation]);

    return { isThinking };
}
