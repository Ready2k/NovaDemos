'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

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
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Connect directly to agent (bypassing gateway)
    const wsHost = process.env.NEXT_PUBLIC_WS_URL?.replace('ws://', '').replace(':8080', '') || 'localhost';
    const wsUrl = `ws://${wsHost}:${selectedAgent.port}/session`;
    console.log(`[AgentTest] Connecting to ${selectedAgent.name} at ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`[AgentTest] Connected to ${selectedAgent.name}`);
      setIsConnected(true);
      setIsConnecting(false);

      // Send session init
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
        content: `Connected to ${selectedAgent.name} (Text Mode - No Voice)`,
        timestamp: Date.now()
      }]);

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

    ws.onmessage = (event) => {
      try {
        // Skip binary messages (audio data) - check both Blob and ArrayBuffer
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          console.log('[AgentTest] Skipping binary audio data');
          return;
        }

        // Skip if data is not a string (additional safety check)
        if (typeof event.data !== 'string') {
          console.log('[AgentTest] Skipping non-string data:', typeof event.data);
          return;
        }

        const message = JSON.parse(event.data);
        console.log(`[AgentTest] Received:`, message.type, message);

        switch (message.type) {
          case 'transcript':
            if (message.role && message.text) {
              const messageId = message.id || `${message.role}-${message.timestamp || Date.now()}`;
              
              console.log(`[AgentTest] Transcript received:`, {
                id: messageId,
                role: message.role,
                text: message.text.substring(0, 50),
                isFinal: message.isFinal,
                originalId: message.id
              });
              
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
                    content: message.text,
                    timestamp: message.timestamp || Date.now()
                  };
                  return updated;
                } else {
                  // ADDITIONAL CHECK: Look for duplicate content from same role
                  const duplicateIndex = prev.findIndex(m => 
                    m.role === message.role && 
                    m.content === message.text &&
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
                    content: message.text,
                    timestamp: message.timestamp || Date.now()
                  } as any];
                }
              });
            }
            break;

          case 'tool_use':
            setMessages(prev => [...prev, {
              role: 'system',
              content: `🔧 Tool: ${message.toolName}`,
              timestamp: Date.now()
            }]);
            break;

          case 'tool_result':
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
        }
      } catch (error) {
        console.error('[AgentTest] Error parsing message:', error);
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
            Direct text-only communication with agents (bypasses Gateway, no voice wrapper)
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
              <div className="mt-6 space-y-2">
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
                  <div>❌ Gateway Routing</div>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  This mode tests agents directly without the voice wrapper, showing pure LangGraph workflow execution.
                </div>
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
                  messages.map((msg, idx) => (
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
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
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
              </div>

              {/* Status */}
              <div className="mt-4 text-sm text-gray-400 text-center">
                {isConnected ? (
                  <span className="text-green-400">● Connected to {selectedAgent.name}</span>
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
