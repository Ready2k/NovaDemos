
import { useState, useEffect, useRef } from 'react';
import { Message } from '../types';

interface UseWorkflowSimulatorProps {
    isActive: boolean;
    isConnected: boolean;
    messages: Message[];
    onSendMessage: (text: string) => void;
    testPersona?: string;
    testInstructions?: string;
    stopSimulation: () => void;
    sendJson: (message: any) => void; // Add sendJson
    testName?: string;
    maxTurns?: number;
}

export function useWorkflowSimulator({ isActive, isConnected, messages, onSendMessage, testPersona, testInstructions, stopSimulation, sendJson, testName = 'Manual Test', maxTurns = 10 }: UseWorkflowSimulatorProps) {
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

        // On activation, notify backend this is a test
        if (isActive && messages.length === 0 && !waitingForEcho.current && !isThinking) {
            console.log('[Simulator] Starting test session:', testName);
            sendJson({
                type: 'test_config',
                data: {
                    testName: testName,
                    result: 'UNKNOWN'
                }
            });
        }

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

            // Check Max Turns
            // Count user messages in current session
            const userTurns = messages.filter(m => m.role === 'user').length;
            if (userTurns >= maxTurns) {
                console.log(`[Simulator] Max turns reached (${maxTurns}). Failing test.`);

                // Send Failure result to backend
                sendJson({
                    type: 'test_config',
                    data: {
                        testName: testName,
                        result: 'FAIL', // System Result 
                        userResult: 'FAIL',
                        notes: `Max turns reached (${maxTurns})`
                    }
                });

                // Display failure message
                onSendMessage(`[FAIL] (Max turns reached: ${maxTurns})`);
                waitingForEcho.current = true;

                // Stop with delay
                setTimeout(() => {
                    stopSimulation();
                }, 1500);
                return;
            }

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
                    let userResult = 'UNKNOWN';

                    if (text.includes('[PASS]')) {
                        text = text.replace('[PASS]', '').trim();
                        isDone = true;
                        userResult = 'PASS';
                    } else if (text.includes('[FAIL]')) {
                        text = text.replace('[FAIL]', '').trim();
                        isDone = true;
                        userResult = 'FAIL';
                    } else if (text.includes('[DONE]')) {
                        // Legacy fallback
                        text = text.replace('[DONE]', '').trim();
                        isDone = true;
                        userResult = 'PASS';
                    }

                    if (isDone && !text) {
                        text = "(Test Complete)";
                    }

                    onSendMessage(text);
                    waitingForEcho.current = true; // Mark as waiting for transcript update

                    if (isDone) {
                        console.log('[Simulator] Objective achieved. Terminating simulation...');
                        // Notify backend of success
                        sendJson({
                            type: 'test_config',
                            data: {
                                testName: testName,
                                result: 'PASS', // System Result (Test Completed)
                                userResult: userResult // User Result (PASS/FAIL)
                            }
                        });
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

    }, [isActive, isConnected, messages, effectivePersona, isThinking, onSendMessage, stopSimulation, sendJson, testName, testInstructions]);

    return { isThinking };
}
