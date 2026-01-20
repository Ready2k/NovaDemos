'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import InsightPanel from '@/components/layout/InsightPanel';
import MobileNav from '@/components/layout/MobileNav';
import IntelligenceOrb from '@/components/intelligence/IntelligenceOrb';
import ChatContainer from '@/components/chat/ChatContainer';
import CommandBar from '@/components/chat/CommandBar';
import SessionSurveyModal from '@/components/search/SessionSurveyModal';
import AboutModal from '@/components/layout/AboutModal';
import Toast from '@/components/ui/Toast';
import { useApp } from '@/lib/context/AppContext';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { useAudioProcessor } from '@/lib/hooks/useAudioProcessor';
import { cn } from '@/lib/utils';
import type { WebSocketMessage } from '@/lib/types';

import SettingsLayout from '@/components/settings/SettingsLayout';

export default function Home() {
  const {
    connectionStatus,
    setConnectionStatus,
    messages,
    addMessage,
    updateLastMessage,
    currentSession,
    setCurrentSession,
    updateSessionStats,
    isDarkMode,
    setIsDarkMode,
    settings,
    activeView,
    isHydrated,
  } = useApp();

  // Local state for survey
  const [showSurvey, setShowSurvey] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Ref to store send function (to avoid dependency issues)
  const sendRef = useRef<((message: any) => void) | null>(null);

  // Ref to track the last user message sent via text (for deduping echoes)
  const lastUserMessageRef = useRef<string | null>(null);

  // Ref to prevent double-connect in React Strict Mode
  const hasConnectedRef = useRef(false);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('[WebSocket] Received message:', message.type);

    switch (message.type) {
      case 'connected':
        // Backend confirmation of connection
        console.log('[Session] Backend connected, starting session...');
        setConnectionStatus('connected'); // Set to connected now
        // Small delay to ensure WebSocket is fully ready
        setTimeout(() => {
          if (sendRef.current) {
            sendRef.current({
              type: 'sessionConfig',
              config: {
                brainMode: settings.brainMode || 'raw_nova',
                voiceId: settings.voicePreset || 'matthew',
                systemPrompt: settings.systemPrompt || '',
                speechPrompt: settings.speechPrompt || '',
                enableGuardrails: settings.enableGuardrails ?? true,
                selectedTools: settings.enabledTools || [],
                // Default agent settings if in agent mode
                agentId: settings.brainMode === 'bedrock_agent' ? undefined : undefined,
                agentAliasId: settings.brainMode === 'bedrock_agent' ? undefined : undefined,
              },
            });
          }
        }, 100); // 100ms delay
        break;

      case 'session_start':
        console.log('[Session] Started:', message.sessionId);
        setCurrentSession({
          sessionId: message.sessionId,
          startTime: message.timestamp || new Date().toISOString(),
          duration: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          transcript: [],
          brainMode: settings.brainMode,
          voicePreset: settings.voicePreset,
        });
        // Update connection status to connected
        setConnectionStatus('connected');
        setHasInteracted(true); // Mark session as active for survey
        break;

      case 'audio':
        // Play received audio
        if (message.audio) {
          audioProcessor.playAudio(message.audio);
        }
        break;

      case 'transcript':
        const cleanText = message.text ? message.text.replace(/\[SENTIMENT:.*?\]/g, '').trim() : '';
        if (!cleanText) break;

        // Dedup Strategies:
        // 1. Search backwards for the last message of the same role to update (for streaming/interim)
        let targetIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === message.role) {
            targetIndex = i;
            break;
          }
        }

        const targetMsg = targetIndex !== -1 ? messages[targetIndex] : null;

        if (message.isFinal) {
          // Check for exact duplicate of the FINAL message (idempotency)
          if (targetMsg && targetMsg.isFinal && targetMsg.content === cleanText) {
            console.log('[App] Ignoring duplicate final message');
            break;
          }

          // If we have a previous non-final message (interim) of the same role, update it to final
          if (targetMsg && !targetMsg.isFinal && targetIndex === messages.length - 1) {
            updateLastMessage({
              content: cleanText,
              isFinal: true,
              sentiment: message.sentiment
            });
          } else {
            // Otherwise add new final message
            addMessage({
              role: message.role,
              content: cleanText,
              timestamp: message.timestamp || Date.now(),
              isFinal: true,
              sentiment: message.sentiment,
            });
          }
        } else {
          // Interim/Streaming transcript
          // Only update if the last message is the same role and is non-final
          if (targetMsg && !targetMsg.isFinal && targetIndex === messages.length - 1) {
            updateLastMessage({
              content: cleanText
            });
          } else {
            // Add new interim message
            addMessage({
              role: message.role,
              content: cleanText,
              timestamp: message.timestamp || Date.now(),
              isFinal: false,
              sentiment: message.sentiment,
            });
          }
        }
        break;

      case 'metadata':
        // Session metadata (trace ID, version, etc.)
        console.log('[Session] Metadata:', message);
        // Could store trace ID for debugging/feedback
        break;

      case 'usage':
        // Token usage update (alias for token_usage)
        if (message.data) {
          updateSessionStats({
            inputTokens: message.data.totalInputTokens || message.data.inputTokens,
            outputTokens: message.data.totalOutputTokens || message.data.outputTokens,
          });
        }
        break;

      case 'token_usage':
        updateSessionStats({
          inputTokens: message.inputTokens,
          outputTokens: message.outputTokens,
        });
        break;

      case 'error':
        console.error('[WebSocket] Error:', message.message, message.details);
        // Could show a toast notification here
        break;

      case 'tool_use':
        console.log('[Tool] Using:', message.toolName, message.toolInput);
        // Could add a system message to chat
        break;

      case 'tool_result':
        console.log('[Tool] Result:', message.toolName, message.toolResult);
        // Could add a system message to chat
        break;

      case 'workflow_update':
        console.log('[Workflow] Update:', message.currentStep);
        // Could update workflow state
        break;

      case 'interruption':
        console.log('[App] Interruption received - clearing audio queue');
        audioProcessor.clearQueue();
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }, [messages, addMessage, updateLastMessage, setCurrentSession, setConnectionStatus, updateSessionStats, settings]);

  // Initialize WebSocket
  const {
    connect,
    disconnect,
    send,
    sendBinary,
    isConnected,
  } = useWebSocket({
    url: 'ws://localhost:8080/sonic',
    autoConnect: false, // Manual connect to avoid Strict Mode issues
    onOpen: () => {
      console.log('[WebSocket] Connected to server, waiting for confirmation...');
      setConnectionStatus('connecting');
      // Don't send start_session here - wait for 'connected' message from backend
    },
    onClose: () => {
      console.log('[WebSocket] Disconnected');
      setConnectionStatus('disconnected');
      audioProcessor.stopRecording();
    },
    onError: (error) => {
      console.error('[WebSocket] Error:', error);
      setConnectionStatus('disconnected');
    },
    onMessage: handleWebSocketMessage,
  });

  // Initialize audio processor
  const audioProcessor = useAudioProcessor({
    onAudioData: (data) => {
      // Send audio data to WebSocket
      console.log('[App] onAudioData received', data.byteLength, 'bytes. isConnected:', isConnected);
      if (isConnected) {
        sendBinary(data);
        setHasInteracted(true);
      } else {
        console.warn('[App] Audio data received but not connected');
      }
    },
  });
  // Interaction Mode Sync: Mute audio if in 'chat_only' mode
  useEffect(() => {
    if (settings.interactionMode === 'chat_only') {
      console.log('[App] Chat Only mode: Muting audio processor');
      audioProcessor.setMuted(true);
      // Also stop recording if active
      if (connectionStatus === 'recording') {
        audioProcessor.stopRecording();
        setConnectionStatus('connected');
      }
    } else {
      audioProcessor.setMuted(false);
    }
  }, [settings.interactionMode, audioProcessor, connectionStatus]);
  // Store send function in ref for use in message handler
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Sync settings to backend when they change (if connected)
  useEffect(() => {
    if (isConnected && send) {
      console.log('[App] Syncing settings to backend...');
      send({
        type: 'sessionConfig',
        config: {
          brainMode: settings.brainMode || 'raw_nova',
          voiceId: settings.voicePreset || 'matthew',
          systemPrompt: settings.systemPrompt || '',
          speechPrompt: settings.speechPrompt || '',
          enableGuardrails: settings.enableGuardrails ?? true,
          selectedTools: settings.enabledTools || [],
          agentId: settings.brainMode === 'bedrock_agent' ? undefined : undefined,
          agentAliasId: settings.brainMode === 'bedrock_agent' ? undefined : undefined,
        }
      });
    }
  }, [
    isConnected,
    send,
    settings.brainMode,
    settings.voicePreset,
    settings.systemPrompt,
    settings.speechPrompt,
    settings.enableGuardrails,
    settings.enabledTools
  ]);

  // Handle send text message
  const handleSendMessage = useCallback((text: string) => {
    console.log('[App] handleSendMessage called with:', text);
    console.log('[App] isConnected:', isConnected);

    if (!isConnected) {
      console.warn('[App] Not connected, cannot send message');
      return;
    }

    setHasInteracted(true); // Ensure survey triggers

    // Send to WebSocket
    // Note: We do NOT add the message to the UI here (Optimistic UI disabled).
    // We wait for the 'transcript' event from the backend to ensure Source of Truth & Zero Duplicates.
    console.log('[App] Sending message to WebSocket');
    send({
      type: 'textInput',
      text: text
    });
  }, [isConnected, send]);

  // Handle toggle recording
  const handleToggleRecording = useCallback(async () => {
    // Phase 4: Block recording if in 'chat_only' mode
    if (settings.interactionMode === 'chat_only') {
      console.warn('[App] Cannot record in Chat Only mode');
      return;
    }

    if (connectionStatus === 'recording') {
      // Stop recording
      audioProcessor.stopRecording();
      setConnectionStatus('connected');
    } else if (connectionStatus === 'connected') {
      // Start recording
      try {
        await audioProcessor.startRecording();
        setConnectionStatus('recording');
      } catch (error) {
        console.error('[Audio] Failed to start recording:', error);
        alert('Failed to access microphone. Please check permissions.');
      }
    }
  }, [connectionStatus, audioProcessor, setConnectionStatus]);

  // Handle Connection Toggle (Manual)
  const handleConnectionToggle = useCallback(() => {
    if (connectionStatus === 'connected' || connectionStatus === 'recording' || connectionStatus === 'connecting') {
      // Disconnecting
      console.log('[App] Disconnecting... hasInteracted:', hasInteracted);
      if (hasInteracted) {
        setShowSurvey(true);
      }
      disconnect();
    } else {
      // Connecting
      connect();
    }
  }, [connectionStatus, connect, disconnect, hasInteracted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      audioProcessor.cleanup();
      // Don't reset hasInteracted here to allow survey to show if needed?
      // Actually, unmount happens on refresh, so we lose state anyway.
    };
  }, []);

  return (
    <div className={cn(
      "flex h-screen overflow-hidden transition-colors duration-300",
      isDarkMode ? "bg-ink-bg" : "bg-white"
    )}>
      {/* Desktop: Slim iconic sidebar (60px) */}
      <Sidebar className="hidden md:flex" />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header with title, version, and mode */}
        <header className={cn(
          "flex items-center justify-between px-8 py-4 border-b transition-colors duration-300",
          isDarkMode ? "border-white/8" : "border-gray-200"
        )}>
          <div className="flex flex-col gap-1">
            <h1 className={cn(
              "text-xl font-semibold transition-colors duration-300",
              isDarkMode ? "text-ink-text-primary" : "text-gray-900"
            )}>Nova Sonic</h1>
            <div className={cn(
              "flex items-center gap-2 text-[10px] uppercase tracking-wider font-medium transition-colors duration-300",
              isDarkMode ? "text-ink-text-muted/60" : "text-gray-500"
            )}>
              <span>v2.0.0</span>
              <span className="opacity-30">|</span>
              <span suppressHydrationWarning>
                {isHydrated ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Loading...'}
              </span>
              <span className="opacity-30">|</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded-md border text-[9px] font-bold transition-colors duration-300",
                isDarkMode ? "bg-white/5 border-white/10 text-ink-text-muted" : "bg-gray-100 border-gray-200 text-gray-600"
              )}>
                MODE: {isHydrated ? (settings.brainMode === 'raw_nova' ? 'NOVA SONIC' : 'AGENT') : 'NOVA SONIC'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-300",
                isDarkMode ? "bg-white/5 hover:bg-white/10 border-white/8" : "bg-gray-100 hover:bg-gray-200 border-gray-300"
              )}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="text-base">{isDarkMode ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </header>

        {activeView === 'chat' ? (
          <>
            {/* Intelligence Orb (center stage) */}
            <IntelligenceOrb />

            {/* Chat Container - now with proper flex */}
            <div className="flex-1 overflow-hidden">
              <ChatContainer isDarkMode={isDarkMode} />
            </div>

            {/* Command Bar - now part of flex layout, not fixed */}
            <div className="flex-shrink-0 pb-0 md:pb-0 mb-16 md:mb-0">
              <CommandBar
                status={connectionStatus}
                isDarkMode={isDarkMode}
                onSendMessage={handleSendMessage}
                onToggleRecording={handleToggleRecording}
                onToggleConnection={handleConnectionToggle}
              />
            </div>
          </>
        ) : activeView === 'settings' ? (
          <SettingsLayout />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            View: {activeView} (Coming Soon)
          </div>
        )}
      </main>


      {/* Desktop: Right insight panel */}
      <InsightPanel className="hidden lg:flex" isDarkMode={isDarkMode} />

      {/* Mobile: Bottom nav */}
      <MobileNav className="md:hidden" />

      {/* Post-Session Feedback Survey */}
      <SessionSurveyModal
        isOpen={showSurvey}
        onClose={() => {
          setShowSurvey(false);
          setHasInteracted(false); // Reset interaction flag after survey
        }}
        onSendFeedback={async (score, comment) => {
          // Send feedback via HTTP to avoid WS disconnection issues
          try {
            const feedbackPayload = {
              sessionId: currentSession?.sessionId, // Correlate if possible
              score,
              comment,
              timestamp: Date.now()
            };
            await fetch('/api/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(feedbackPayload)
            });
            console.log('[App] Feedback sent via HTTP');
          } catch (e) {
            console.error('[App] Failed to send feedback', e);
          }
        }}
        isDarkMode={isDarkMode}
      />

      {/* Application Info Modal */}
      <AboutModal />

      {/* Global Notifications */}
      <Toast />
    </div>
  );
}
