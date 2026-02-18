'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAudioProcessor } from '@/lib/hooks/useAudioProcessor';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  port: number;
}

// Animated thinking dots component
function ThinkingDots() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev % 3) + 1);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-gray-400">
      Thinking{'.'.repeat(dots)}
    </span>
  );
}

const AGENTS: Agent[] = [
  { id: 'triage', name: 'Triage Agent', description: 'Routes conversations to specialized agents', port: 8081 },
  { id: 'banking', name: 'Banking Agent', description: 'Handles banking operations', port: 8082 },
  { id: 'mortgage', name: 'Mortgage Agent', description: 'Mortgage inquiries and calculations', port: 8083 },
  { id: 'idv', name: 'IDV Agent', description: 'Identity verification', port: 8084 },
  { id: 'disputes', name: 'Disputes Agent', description: 'Handles transaction disputes', port: 8085 },
  { id: 'investigation', name: 'Investigation Agent', description: 'Fraud investigation', port: 8086 },
];

export default function AgentTestPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useGateway, setUseGateway] = useState(true);
  const [useVoiceMode, setUseVoiceMode] = useState(false); // NEW: Voice mode toggle
  const [currentAgent, setCurrentAgent] = useState<string>('triage');
  const [isThinking, setIsThinking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio processor for voice mode
  const audioProcessor = useAudioProcessor({
    onAudioData: (audioData) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && useVoiceMode) {
        // Send audio data as binary
        wsRef.current.send(audioData);
      }
    },
    inputSampleRate: 16000,   // Microphone input at 16kHz
    outputSampleRate: 24000,  // Nova Sonic output at 24kHz
  });

  // Auto-scroll to bottom ONLY when user sends a message or on first message
  // Don't auto-scroll on agent responses to avoid disrupting reading
  const lastMessageRef = useRef<number>(0);

  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      // Only auto-scroll if:
      // 1. It's the first message
      // 2. The last message is from the user (they just sent something)
      if (messages.length === 1 || (lastMessage.role === 'user' && messages.length > lastMessageRef.current)) {
        const container = messagesEndRef.current.parentElement;
        if (container) {
          // Scroll to bottom smoothly
          container.scrollTop = container.scrollHeight;
        }
      }

      lastMessageRef.current = messages.length;
    }
  }, [messages]);

  // Connect to agent
  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setMessages([]);

    const newSessionId = `test-${Date.now()}`;
    setSessionId(newSessionId);

    // Determine WebSocket host
    let wsHost: string;
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      // Use current hostname (localhost for local dev, actual hostname for remote)
      wsHost = hostname;
    } else {
      // Server-side rendering fallback
      wsHost = process.env.NEXT_PUBLIC_WS_URL?.replace('ws://', '').replace(':8080', '') || 'localhost';
    }

    let wsUrl: string;
    let connectionMode: string;

    if (useGateway) {
      // Gateway Mode: Connect to gateway which will route to agents
      wsUrl = `ws://${wsHost}:8080/sonic`;
      connectionMode = 'Gateway (Agent-to-Agent Routing)';
      console.log(`[AgentTest] Gateway Mode: Connecting to gateway at ${wsUrl}`);
    } else {
      // Direct Mode: Connect directly to selected agent
      wsUrl = `ws://${wsHost}:${selectedAgent.port}/session`;
      connectionMode = `Direct to ${selectedAgent.name}`;
      console.log(`[AgentTest] Direct Mode: Connecting to ${selectedAgent.name} at ${wsUrl}`);
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`[AgentTest] Connected (${connectionMode})`);
      setIsConnected(true);
      setIsConnecting(false);

      if (useGateway) {
        // Gateway mode: Select workflow (agent)
        ws.send(JSON.stringify({
          type: 'select_workflow',
          workflowId: selectedAgent.id
        }));

        setCurrentAgent(selectedAgent.id);

        setMessages(prev => [...prev, {
          role: 'system',
          content: `Connected via Gateway → ${selectedAgent.name} (${useVoiceMode ? 'Voice' : 'Text'} Mode)`,
          timestamp: Date.now()
        }]);
      } else {
        // Direct mode: Send session init
        ws.send(JSON.stringify({
          type: 'session_init',
          sessionId: newSessionId,
          memory: {
            // Pre-populate with test data for banking/idv agents
            verified: selectedAgent.id === 'banking',
            userName: selectedAgent.id === 'banking' ? 'Test User' : undefined,
            account: selectedAgent.id === 'banking' ? '12345678' : undefined,
            sortCode: selectedAgent.id === 'banking' ? '112233' : undefined,
          },
          timestamp: Date.now()
        }));

        setMessages(prev => [...prev, {
          role: 'system',
          content: `Connected to ${selectedAgent.name} (Direct - No Gateway)`,
          timestamp: Date.now()
        }]);
      }

      // Trigger initial greeting from agent
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'text_input',
            text: '[SYSTEM: Greet the user]',
            sessionId: newSessionId
          }));
        }
      }, 500);
    };

    ws.onmessage = async (event) => {
      // Handle binary audio data in voice mode
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        if (useVoiceMode) {
          console.log('[AgentTest] Received binary audio data');
          const audioData = event.data instanceof Blob
            ? await event.data.arrayBuffer()
            : event.data;
          await audioProcessor.playAudio(audioData);
        }
        return;
      }

      // Skip if data is not a string (additional safety check)
      if (typeof event.data !== 'string') {
        console.log('[AgentTest] Skipping non-string data:', typeof event.data);
        return;
      }

      try {
        const message = JSON.parse(event.data);
        console.log(`[AgentTest] Received:`, message.type, message);

        switch (message.type) {
          case 'transcript':
            if (message.role && message.text) {
              // Use message ID if available, else derive one with randomness to prevent collision
              const messageId = message.id || `${message.role}-${message.timestamp || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

              console.log(`[AgentTest] Transcript received:`, {
                id: messageId,
                role: message.role,
                text: message.text.substring(0, 50),
                isFinal: message.isFinal,
                originalId: message.id
              });

              // Stop thinking animation when agent responds (ANY response from assistant should stop thinking)
              if (message.role === 'assistant') {
                setIsThinking(false);
              }

              // Filter out internal system messages
              const isSystemMessage = message.text.startsWith('[SYSTEM:') ||
                message.text.startsWith('[System:') ||
                message.text.startsWith('I want to '); // Auto-trigger messages

              if (isSystemMessage) {
                console.log(`[AgentTest] Filtering out system message: ${message.text}`);
                return; // Don't display system messages
              }

              // Clean up agent messages - remove [STEP: ...] prefixes
              let cleanText = message.text;
              if (message.role === 'assistant') {
                // Remove all [STEP: xxx] patterns
                cleanText = cleanText.replace(/\[STEP:\s*[^\]]+\]\s*/g, '');
                // Remove any remaining workflow markers
                cleanText = cleanText.replace(/\[WORKFLOW:\s*[^\]]+\]\s*/g, '');
                cleanText = cleanText.trim();
              }

              // Deduplicate by ID - update existing message if ID matches
              setMessages(prev => {
                const existingIndex = prev.findIndex(m =>
                  (m as any).id === messageId
                );

                if (existingIndex >= 0) {
                  // Update existing message
                  console.log(`[AgentTest] Updating existing message at index ${existingIndex}`);
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    content: cleanText,
                    timestamp: message.timestamp || Date.now()
                  };
                  return updated;
                } else {
                  // ADDITIONAL CHECK: Look for duplicate content from same role
                  const duplicateIndex = prev.findIndex(m =>
                    m.role === message.role &&
                    m.content === cleanText &&
                    Date.now() - m.timestamp < 5000 // Within 5 seconds
                  );

                  if (duplicateIndex >= 0) {
                    console.log(`[AgentTest] Skipping duplicate content at index ${duplicateIndex}`);
                    return prev; // Don't add duplicate
                  }

                  // Add new message
                  console.log(`[AgentTest] Adding new message with ID: ${messageId}`);
                  return [...prev, {
                    id: messageId,
                    role: message.role,
                    content: cleanText,
                    timestamp: message.timestamp || Date.now()
                  } as any];
                }
              });
            }
            break;

          case 'tool_use':
            // Agent is using a tool, show thinking state
            setIsThinking(true);
            setMessages(prev => [...prev, {
              role: 'system',
              content: `🔧 Tool: ${message.toolName}`,
              timestamp: Date.now()
            }]);
            break;

          case 'tool_result':
            // Tool completed, keep thinking state until agent responds
            setMessages(prev => [...prev, {
              role: 'system',
              content: `✅ Tool Result: ${message.toolName}`,
              timestamp: Date.now()
            }]);
            break;

          case 'error':
            setMessages(prev => [...prev, {
              role: 'system',
              content: `❌ Error: ${message.message}`,
              timestamp: Date.now()
            }]);
            break;

          case 'connected':
            console.log(`[AgentTest] Session confirmed: ${message.sessionId}`);
            break;

          case 'handoff_event':
            // Gateway mode: Track agent handoffs
            if (useGateway && message.target) {
              setCurrentAgent(message.target);
              setMessages(prev => [...prev, {
                role: 'system',
                content: `🔄 Handoff: Transferred to ${message.target.toUpperCase()} agent`,
                timestamp: Date.now()
              }]);
            }
            break;

          default:
            // Silently ignore unknown message types (e.g., raw Nova Sonic events, metadata, etc.)
            // These are filtered at the gateway/agent level but log them for debugging
            console.log(`[AgentTest] Ignoring unknown message type: ${message.type}`);
            break;
        }
      } catch (error) {
        console.error('[AgentTest] Error parsing message:', error);
        console.error('[AgentTest] Raw message data:', event.data);
        console.error('[AgentTest] Message preview:', typeof event.data === 'string' ? event.data.substring(0, 200) : 'not a string');

        // Show error in UI
        setMessages(prev => [...prev, {
          role: 'system',
          content: `❌ Error: Invalid JSON message format`,
          timestamp: Date.now()
        }]);
      }
    };

    ws.onerror = (error) => {
      console.error(`[AgentTest] WebSocket error:`, error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: '❌ Connection error',
        timestamp: Date.now()
      }]);
    };

    ws.onclose = () => {
      console.log(`[AgentTest] Disconnected from ${selectedAgent.name}`);
      setIsConnected(false);
      setIsConnecting(false);
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Disconnected',
        timestamp: Date.now()
      }]);
    };

    wsRef.current = ws;
  };

  // Disconnect
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  // Send message
  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || !isConnected) return;

    const message = {
      type: 'text_input',
      text: input.trim(),
      sessionId: sessionId
    };

    console.log(`[AgentTest] Sending:`, message);
    wsRef.current.send(JSON.stringify(message));

    // Set thinking state when user sends message
    setIsThinking(true);
    setInput('');
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Agent Test Console</h1>
          <p className="text-gray-400">
            Test agent communication with Gateway Routing ON (agents hand off to each other) or OFF (direct agent access)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent Selector */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Select Agent</h2>

              <div className="space-y-2">
                {AGENTS.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      if (isConnected) disconnect();
                      setSelectedAgent(agent);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-lg transition-all",
                      selectedAgent.id === agent.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    )}
                  >
                    <div className="font-semibold">{agent.name}</div>
                    <div className="text-sm opacity-75">{agent.description}</div>
                    <div className="text-xs opacity-50 mt-1">Port: {agent.port}</div>
                  </button>
                ))}
              </div>

              {/* Connection Controls */}
              <div className="mt-6 space-y-4">
                {/* Gateway Mode Toggle */}
                <div className="p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="gateway-toggle" className="font-semibold text-sm">
                      Gateway Routing
                    </label>
                    <button
                      id="gateway-toggle"
                      onClick={() => {
                        if (isConnected) disconnect();
                        setUseGateway(!useGateway);
                      }}
                      disabled={isConnected}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        useGateway ? "bg-green-600" : "bg-gray-600",
                        isConnected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          useGateway ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    {useGateway
                      ? "✅ Agents can hand off to each other via Gateway"
                      : "❌ Direct connection - no agent handoffs"}
                  </p>
                </div>

                {/* Voice Mode Toggle */}
                <div className="p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="voice-toggle" className="font-semibold text-sm">
                      Voice Mode
                    </label>
                    <button
                      id="voice-toggle"
                      onClick={() => {
                        if (isConnected) disconnect();
                        setUseVoiceMode(!useVoiceMode);
                      }}
                      disabled={isConnected}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        useVoiceMode ? "bg-purple-600" : "bg-gray-600",
                        isConnected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          useVoiceMode ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    {useVoiceMode
                      ? "🎤 Audio input/output enabled"
                      : "⌨️ Text-only mode"}
                  </p>
                </div>

                {!isConnected ? (
                  <button
                    onClick={connect}
                    disabled={isConnecting}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <button
                    onClick={disconnect}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Architecture Info */}
              <div className="mt-6 p-4 bg-gray-700 rounded-lg text-sm">
                <h3 className="font-semibold mb-2">Architecture</h3>
                <div className="space-y-1 text-gray-300">
                  <div>✅ Agent Core (LangGraph)</div>
                  <div>✅ Claude Sonnet (Decisions)</div>
                  <div>✅ Tools Execution</div>
                  <div>❌ Nova Sonic (Voice)</div>
                  <div className={useGateway ? "text-green-400" : "text-gray-500"}>
                    {useGateway ? "✅" : "❌"} Gateway Routing
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  {useGateway ? (
                    <>
                      <strong className="text-green-400">Gateway Mode:</strong> Agents can hand off conversations to each other.
                      Try asking Triage for your balance - it will route through IDV → Banking.
                    </>
                  ) : (
                    <>
                      <strong className="text-gray-500">Direct Mode:</strong> Each agent works independently in their specialist area only.
                      No handoffs between agents.
                    </>
                  )}
                </div>
                {useGateway && isConnected && (
                  <div className="mt-3 p-2 bg-gray-800 rounded text-xs">
                    <div className="text-gray-400">Current Agent:</div>
                    <div className="text-green-400 font-semibold">{currentAgent.toUpperCase()}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-6 flex flex-col h-[calc(100vh-12rem)]">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <p>No messages yet</p>
                    <p className="text-sm mt-2">Connect to an agent and start chatting</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-4 rounded-lg",
                          msg.role === 'user' && "bg-blue-600 ml-12",
                          msg.role === 'assistant' && "bg-gray-700 mr-12",
                          msg.role === 'system' && "bg-gray-900 text-gray-400 text-sm text-center"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {msg.role !== 'system' && (
                            <div className="font-semibold text-sm opacity-75">
                              {msg.role === 'user' ? '👤 You' : '🤖 Agent'}
                            </div>
                          )}
                          <div className="flex-1">{msg.content}</div>
                        </div>
                      </div>
                    ))}

                    {/* Thinking Animation */}
                    {isThinking && (
                      <div className="p-4 rounded-lg bg-gray-700 mr-12">
                        <div className="flex items-start gap-3">
                          <div className="font-semibold text-sm opacity-75">🤖 Agent</div>
                          <div className="flex-1">
                            <ThinkingDots />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                {useVoiceMode ? (
                  /* Voice Mode Controls */
                  <>
                    <button
                      onClick={async () => {
                        if (!audioProcessor.isRecording) {
                          await audioProcessor.initialize();
                          await audioProcessor.startRecording();
                        } else {
                          audioProcessor.stopRecording();
                        }
                      }}
                      disabled={!isConnected}
                      className={cn(
                        "flex-1 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2",
                        audioProcessor.isRecording
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-600"
                      )}
                    >
                      {audioProcessor.isRecording ? (
                        <>
                          <span className="inline-block w-3 h-3 bg-white rounded-full animate-pulse"></span>
                          Stop Recording
                        </>
                      ) : (
                        <>
                          🎤 Start Recording
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => audioProcessor.setMuted(!audioProcessor.isMuted)}
                      disabled={!isConnected}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-3 rounded-lg transition-colors"
                      title={audioProcessor.isMuted ? "Unmute" : "Mute"}
                    >
                      {audioProcessor.isMuted ? "🔇" : "🔊"}
                    </button>
                  </>
                ) : (
                  /* Text Mode Controls */
                  <>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={!isConnected}
                      placeholder={isConnected ? "Type a message..." : "Connect to an agent first"}
                      className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!isConnected || !input.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Send
                    </button>
                  </>
                )}
              </div>

              {/* Status */}
              <div className="mt-4 text-sm text-gray-400 text-center">
                {isConnected ? (
                  <span className="text-green-400">
                    ● Connected to {useGateway ? `${currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)} Agent` : selectedAgent.name}
                  </span>
                ) : (
                  <span className="text-gray-500">○ Not connected</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
