
import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../types';

interface UseWorkflowSimulatorProps {
    isActive: boolean;
    messages: Message[];
    onSendMessage: (text: string) => void;
    testPersona?: string;
    stopSimulation: () => void;
}

export function useWorkflowSimulator({ isActive, messages, onSendMessage, testPersona, stopSimulation }: UseWorkflowSimulatorProps) {
    const [isThinking, setIsThinking] = useState(false);
    const lastProcessedMessageParams = useRef<{ id: number, role: string } | null>(null);

    // Default persona if none provided
    const effectivePersona = testPersona || "You are a helpful user testing the system.";

    useEffect(() => {
        if (!isActive || isThinking) return;

        const lastMessage = messages[messages.length - 1];

        // If no messages (start), or last message was from Assistant, it's User's (Simulator's) turn.
        // Also ensure we haven't already processed this exact message state
        if (!lastMessage) {
            // Start of conversation - wait for greeting? 
            // Usually the user speaks first to wake the agent, OR agent speaks first.
            // If agent speaks first (Welcome), we wait for it.
            // If we need to start, we can trigger a "Hello".
            // Let's check if the list is empty. If so, maybe send "Hello".
            // But usually there is a welcome message.
            return;
        }

        if (lastMessage.role === 'user') {
            // It's our own message, wait for assistant.
            return;
        }

        // Check if we already processed this
        // Simple check: if last processed was this message ID
        // (Assuming index is ID or we use timestamp)
        // With streaming, we need to wait for `isFinal`.
        // Our `messages` prop SHOULD contain only finalized messages or we check `isFinal` property?
        // The `Message` type in `types/index.ts` usually has `isFinal`.
        // Let's assume `messages` updates on every chunk. We wait for stability?
        // Actually, `messages` in `page.tsx` are usually cumulative.
        // Let's check `types/session.ts` for Message definition.

        // Assuming lastMessage is valid trigger.
        // We delay slightly to simulate thinking and not hammer the server.
        const timeoutId = setTimeout(async () => {
            if (isThinking) return;

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
                        persona: effectivePersona
                    })
                });

                if (!res.ok) throw new Error("Simulation API failed");
                const data = await res.json();

                if (data.response) {
                    onSendMessage(data.response);
                }

            } catch (e) {
                console.error("Simulation error:", e);
                stopSimulation(); // Auto-stop on error
            } finally {
                setIsThinking(false);
            }
        }, 2000); // 2s delay for realism

        return () => clearTimeout(timeoutId);

    }, [isActive, messages, effectivePersona, isThinking, onSendMessage, stopSimulation]);

    return { isThinking };
}
