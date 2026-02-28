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
import WorkflowVisualizer from '@/components/chat/WorkflowVisualizer';
import HistoryView from '@/components/chat/HistoryView';
import WorkflowView from '@/components/workflow/WorkflowView';
import { useApp } from '@/lib/context/AppContext';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { useAudioProcessor } from '@/lib/hooks/useAudioProcessor';
import { cn } from '@/lib/utils';
import { AppSettings, Message, WebSocketMessage, SessionStats, SessionStartMessage, AudioMessage, TranscriptMessage, ToolUseMessage, ToolResultMessage, ErrorMessage, TokenUsageMessage, WorkflowUpdateMessage } from '@/lib/types';
import { useWorkflowSimulator } from '@/lib/hooks/useWorkflowSimulator';

import SettingsLayout from '@/components/settings/SettingsLayout';
import TestReportModal from '@/components/workflow/TestReportModal';
import { useRouter } from 'next/navigation';

export default function Home() {
  const {
    connectionStatus,
    setConnectionStatus,
    messages,
    addMessage,
    updateLastMessage,
    clearMessages,
    currentSession,
    setCurrentSession,
    updateSessionStats,
    isDarkMode,
    setIsDarkMode,
    settings,
    activeView,
    isHydrated,
    setWorkflowState,
    updateSettings,
    navigateTo,
    showToast,
  } = useApp();

  // Local state for survey
  const [showSurvey, setShowSurvey] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [finishedSessionId, setFinishedSessionId] = useState<string | null>(null);

  // Test Report State
  const [showTestReport, setShowTestReport] = useState(false);
  const router = useRouter(); // For Reconfigure navigation

  // Ref to store send function (to avoid dependency issues)
  const sendRef = useRef<((message: any) => void) | null>(null);

  // Ref to track the last user message sent via text (for deduping echoes)
  const lastUserMessageRef = useRef<string | null>(null);

  // Ref to prevent double-connect in React Strict Mode
  const hasConnectedRef = useRef(false);

  // Ref to track running latency averages (avoids stale closure issues in useCallback)
  const latencyRef = useRef({ turns: 0, avgTtft: 0, avgLatency: 0 });

  // Ref to track session ID for feedback (robust against state updates)
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentSession?.sessionId) {
      sessionIdRef.current = currentSession.sessionId;
    }
  }, [currentSession?.sessionId]);



  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('[WebSocket] Received message:', message.type);

    switch (message.type) {
      case 'connected':
        // Backend confirmation of connection
        console.log('[Session] Backend connected, captured session ID:', message.sessionId);
        setConnectionStatus('connected'); // Set to connected now

        // Capture session ID early (helps with feedback if session_start is delayed)
        if (message.sessionId) {
          sessionIdRef.current = message.sessionId;
        }

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
                linkedWorkflows: settings.linkedWorkflows || [],
                agentId: settings.agentId,
                agentAliasId: settings.agentAliasId,
                inactivityEnabled: settings.inactivityEnabled ?? true,
                inactivityTimeout: Math.min(settings.inactivityTimeout ?? 20, 50),
                inactivityMaxChecks: settings.inactivityMaxChecks ?? 3,
              },
            });
          }
        }, 100); // 100ms delay
        break;

      case 'session_start':
        console.log('[Session] Started:', message.sessionId);
        // Robust capture: Update ref immediately
        sessionIdRef.current = message.sessionId;
        // Reset latency tracking for new session
        latencyRef.current = { turns: 0, avgTtft: 0, avgLatency: 0 };
        // Clear messages from the previous session
        clearMessages();
        console.log('[Session] Capture Ref Updated:', sessionIdRef.current);

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
        let cleanText = message.text ? message.text.replace(/\[SENTIMENT:.*?\]/g, '').trim() : '';

        // Filter out internal thoughts if they leak
        cleanText = cleanText
          .replace(/^Okay, let me process this.*?(\n|$)/g, '')
          .replace(/^The user provided.*?(\n|$)/g, '')
          .replace(/^I verified.*?(\n|$)/g, '')
          .trim();

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
        if (message.data?.traceId) {
          sessionIdRef.current = message.data.traceId;
        }
        // Capture detected language if present
        if (message.data?.detectedLanguage) {
          console.log('[Session] Language detected:', message.data.detectedLanguage);
          updateSessionStats({
            detectedLanguage: message.data.detectedLanguage,
            languageConfidence: message.data.languageConfidence
          });
        }
        break;

      case 'debugInfo':
        // Suppress debug logs from backend to keep console clean
        break;

      case 'usage':
        // Token usage update (alias for token_usage)
        if (message.data) {
          const inputTokens = message.data.totalInputTokens || message.data.inputTokens || 0;
          const outputTokens = message.data.totalOutputTokens || message.data.outputTokens || 0;

          updateSessionStats({
            inputTokens,
            outputTokens,
          });
        }
        break;

      case 'token_usage':
        // Ensure we update session stats even if message format varies
        const inputTokens = message.inputTokens || (message.data && message.data.inputTokens) || 0;
        const outputTokens = message.outputTokens || (message.data && message.data.outputTokens) || 0;

        updateSessionStats({
          inputTokens,
          outputTokens,
        });
        break;

      case 'latency_update': {
        const ttft = message.ttft_ms as number;
        const lat = message.latency_ms as number;
        if (ttft > 0 && lat > 0) {
          const turns = latencyRef.current.turns + 1;
          latencyRef.current.turns = turns;
          latencyRef.current.avgTtft = Math.round((latencyRef.current.avgTtft * (turns - 1) + ttft) / turns);
          latencyRef.current.avgLatency = Math.round((latencyRef.current.avgLatency * (turns - 1) + lat) / turns);
          updateSessionStats({
            lastTtft: ttft,
            avgTtft: latencyRef.current.avgTtft,
            lastLatency: lat,
            avgLatency: latencyRef.current.avgLatency,
            latencyTurns: turns,
          });
        }
        break;
      }

      case 'reconnecting':
        console.warn('[WebSocket] Reconnecting:', message.message);
        setConnectionStatus('connecting');
        showToast(message.message || 'Reconnecting…', 'info', 8000);
        break;

      case 'reconnected':
        console.log('[WebSocket] Reconnected:', message.message);
        setConnectionStatus('connected');
        showToast(message.message || 'Reconnected successfully', 'success', 4000);
        break;

      case 'error':
        console.error('[WebSocket] Error:', message.message, message.details);
        if (message.fatal) {
          setConnectionStatus('disconnected');
          showToast(message.message || 'Service error — please refresh to reconnect.', 'error', 10000);
        } else {
          showToast(message.message || 'An error occurred.', 'error', 6000);
        }
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
        if (message.currentStep) {
          setWorkflowState({
            currentStep: message.currentStep,
            status: message.currentStep.toLowerCase().includes('complete') ? 'completed' : 'active'
          });
        }
        break;

      case 'interruption':
        console.log('[App] Interruption received - clearing audio queue');
        audioProcessor.clearQueue();
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }, [messages, addMessage, updateLastMessage, clearMessages, setCurrentSession, setConnectionStatus, updateSessionStats, settings, showToast]);

  // Initialize WebSocket
  const getWebSocketUrl = () => {
    let wsUrl = 'ws://localhost:8080/sonic';
    if (typeof window !== 'undefined' && window.location.protocol !== 'file:') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/sonic`;
    }
    return wsUrl;
  };

  const {
    connect,
    disconnect,
    send,
    sendBinary,
    isConnected,
  } = useWebSocket({
    url: getWebSocketUrl(),
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
          linkedWorkflows: settings.linkedWorkflows || [],
          agentId: settings.agentId,
          agentAliasId: settings.agentAliasId,
          inactivityEnabled: settings.inactivityEnabled ?? true,
          inactivityTimeout: Math.min(settings.inactivityTimeout ?? 20, 50),
          inactivityMaxChecks: settings.inactivityMaxChecks ?? 3,
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
    settings.enableGuardrails,
    settings.enabledTools,
    settings.linkedWorkflows,
    settings.inactivityEnabled,
    settings.inactivityTimeout,
    settings.inactivityMaxChecks
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

  // --- Workflow Simulator ---
  // Auto-connect if simulation is active
  useEffect(() => {
    if (settings.simulationMode && connectionStatus === 'disconnected') {
      console.log('[App] Auto-connecting for simulation...');
      connect();
    }
  }, [settings.simulationMode, connectionStatus, connect]);

  const stopSimulation = useCallback(() => {
    // Stop simulation setting
    updateSettings({ simulationMode: false });

    // Capture Session ID before potential disconnect
    const finalId = sessionIdRef.current || currentSession?.sessionId || null;
    console.log('[App] stopSimulation: Capturing Final Session ID:', finalId);
    setFinishedSessionId(finalId);

    // Check Disconnect Action Preference
    const action = settings.activeTestConfig?.disconnectAction || 'always';
    if (action === 'always' || (action === 'ask' && confirm('Test complete. Disconnect?'))) {
      disconnect();
    } else {
      console.log('[App] keeping connection open per test configuration');
    }

    console.log('[App] Simulation stopped.');

    // Trigger Report if configured
    if (settings.activeTestConfig?.saveReport) {
      setShowTestReport(true);
    }
  }, [updateSettings, disconnect, settings.activeTestConfig, currentSession]);

  const { isThinking: isSimulatingThinking } = useWorkflowSimulator({
    isActive: settings.simulationMode || false,
    isConnected,
    messages: messages,
    // @ts-ignore - The hook generally passes a string response, handleSendMessage accepts string.
    onSendMessage: handleSendMessage,
    testPersona: settings.simulationPersona,
    testInstructions: settings.activeTestConfig?.testInstructions,
    stopSimulation,
    sendJson: send,
    testName: settings.activeTestConfig?.testName,
    maxTurns: settings.activeTestConfig?.maxTurns
  });

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
      console.log('[App] Disconnecting... hasInteracted:', hasInteracted, 'Session (Ref):', sessionIdRef.current, 'Session (State):', currentSession?.sessionId);
      if (hasInteracted) {
        const finalId = sessionIdRef.current || currentSession?.sessionId || null;
        console.log('[App] Capturing Final Session ID:', finalId);
        setFinishedSessionId(finalId);
        setShowSurvey(true);
      }

      // Determine if we should show Test Report
      if (settings.activeTestConfig?.saveReport && connectionStatus !== 'connecting') {
        setShowTestReport(true);
        setShowSurvey(false); // Prefer report over survey for tests
      }

      // Ensure simulation stops if we manual disconnect
      updateSettings({ simulationMode: false });
      disconnect();
    } else {
      // Connecting
      setFinishedSessionId(null); // Clear previous
      sessionIdRef.current = null; // Clear ref
      connect();
    }
  }, [connectionStatus, connect, disconnect, hasInteracted, currentSession]);

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
      "flex h-[100dvh] overflow-hidden transition-colors duration-300",
      isDarkMode ? "bg-ink-bg text-ink-text-primary" : "bg-white text-gray-900"
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

        <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
          {activeView === 'chat' ? (
            <>
              {/* Intelligence Orb (Fixed Header Height ~ 85px to 100px) */}
              <div className="w-full h-[100px] flex-shrink-0">
                <IntelligenceOrb getAudioData={audioProcessor.getAudioData} />
              </div>

              {/* Chat Container - takes remaining space */}
              <div className="flex-1 overflow-hidden pb-48 md:pb-0">
                <ChatContainer isDarkMode={isDarkMode} />
              </div>

              {/* Command Bar - Fixed on mobile (Z-60), Flex on desktop */}
              <div className={cn(
                "flex-shrink-0 transition-all duration-300 pointer-events-none", // Wrapper allows clicks through
                "md:static md:z-auto md:mb-0", // Desktop: Natural flow
                "fixed bottom-[84px] left-0 right-0 z-[100] px-2 mb-0" // Mobile: Fixed floating above nav
              )}>
                <div className="pointer-events-auto w-full">
                  <CommandBar
                    status={connectionStatus}
                    isDarkMode={isDarkMode}
                    onSendMessage={handleSendMessage}
                    onToggleRecording={handleToggleRecording}
                    onToggleConnection={handleConnectionToggle}
                  />
                </div>
              </div>
            </>
          ) : activeView === 'settings' ? (
            <SettingsLayout />
          ) : activeView === 'history' ? (
            <HistoryView />
          ) : activeView === 'workflow' ? (
            <WorkflowView />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              View: {activeView} (Coming Soon)
            </div>
          )}
        </div>
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
            // Use multiple fallbacks to ensure we have a session ID
            const sessionId = finishedSessionId || currentSession?.sessionId || sessionIdRef.current;

            console.log('[App] Feedback Debug:', {
              finishedSessionId,
              currentSessionId: currentSession?.sessionId,
              sessionIdRef: sessionIdRef.current,
              finalSessionId: sessionId
            });

            if (!sessionId) {
              console.error('[App] Cannot send feedback: No session ID available');
              return;
            }

            const feedbackPayload = {
              sessionId,
              traceId: sessionId, // Use sessionId as traceId fallback
              score,
              comment,
              name: 'user-feedback'
            };
            console.log('[App] Sending Feedback Payload:', feedbackPayload);

            const response = await fetch('/api/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(feedbackPayload)
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[App] Feedback failed:', response.status, errorText);
            } else {
              console.log('[App] Feedback sent successfully');
            }
          } catch (e) {
            console.error('[App] Failed to send feedback', e);
          }
        }}
        isDarkMode={isDarkMode}
      />

      {/* Test Report Modal */}
      <TestReportModal
        isOpen={showTestReport}
        onClose={() => {
          setShowTestReport(false);
          // "Close will just close the report and go to the main page"
          // Usually we are already on the chat page. If they mean "Main Page" as in "Dashboard",
          // we might need to route there. But typically sticking to Chat is fine.
          // If they are in a test context, clearing activeTestConfig ends the test visual mode.
          updateSettings({ activeTestConfig: undefined, testMode: undefined });
        }}
        onRetry={() => {
          setShowTestReport(false);
          // Reset messages and start testing again
          // We need to clear transcript. 
          // setCurrentSession with empty transcript triggers UI clear.
          setCurrentSession({
            ...currentSession!,
            transcript: [],
            inputTokens: 0,
            outputTokens: 0
          });
          // Re-connect
          if (settings.simulationMode) {
            // Auto-connects via effect
            updateSettings({ simulationMode: true });
          } else {
            connect();
          }
        }}
        onReconfigure={() => {
          setShowTestReport(false);
          updateSettings({ activeTestConfig: undefined, testMode: undefined });
          navigateTo('workflow');
        }}
        messages={messages}
        testConfig={settings.activeTestConfig}
        isDarkMode={isDarkMode}
        sessionId={finishedSessionId || currentSession?.sessionId || sessionIdRef.current}
      />

      {/* Application Info Modal */}
      <AboutModal />



      {/* Global Notifications */}
      <Toast />
    </div>
  );
}
