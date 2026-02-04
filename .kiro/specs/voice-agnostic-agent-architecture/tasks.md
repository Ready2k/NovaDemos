# Implementation Plan: Voice-Agnostic Agent Architecture

## Overview

This implementation plan converts the voice-agnostic agent architecture design into discrete coding tasks. The approach follows the Voice Side-Car Pattern, extracting business logic into Agent Core and wrapping it with thin adapters for voice and text I/O. The implementation will eliminate 1,183 lines of duplicated code while maintaining full backward compatibility.

## Tasks

- [x] 1. Create Agent Core with voice-agnostic interface
  - Extract business logic from agent-runtime-s2s.ts into agent-core.ts
  - Implement session management (initialize, get, end)
  - Implement message processing interface
  - Implement tool execution interface
  - Implement handoff management interface
  - Implement session memory management
  - Implement workflow state management
  - Implement system prompt generation with context injection
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 1.1 Write property test for Agent Core I/O independence
  - **Property 1: Agent Core I/O Independence**
  - **Validates: Requirements 1.2, 1.4, 1.5**

- [x] 1.2 Write property test for session state persistence
  - **Property 3: Session State Persistence**
  - **Validates: Requirements 1.7, 4.8**

- [x] 2. Implement Voice Side-Car wrapper
  - [x] 2.1 Create voice-sidecar.ts with VoiceSideCar class
    - Implement constructor accepting AgentCore and SonicConfig
    - Implement startVoiceSession method
    - Implement stopVoiceSession method
    - Implement handleAudioChunk method
    - Implement endAudioInput method
    - Implement handleTextInput method (for hybrid mode)
    - Implement updateSessionConfig method
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 2.2 Implement SonicEvent handler
    - Handle 'audio' events (forward to WebSocket)
    - Handle 'transcript' events (forward to client, update session)
    - Handle 'toolUse' events (delegate to Agent Core)
    - Handle 'metadata' events (forward to client)
    - Handle 'error' events (forward to client)
    - Handle 'interruption' events (forward to client)
    - Handle 'usageEvent' events (forward to client)
    - Handle 'workflow_update' events (forward to client)
    - _Requirements: 2.3, 2.6, 2.7_

  - [x] 2.3 Write property test for adapter forwarding consistency (voice)
    - **Property 2: Adapter Forwarding Consistency**
    - **Validates: Requirements 2.2, 2.3, 2.6**

  - [x] 2.4 Write property test for SonicClient lifecycle management
    - **Property 4: SonicClient Lifecycle Management**
    - **Validates: Requirements 2.5**

  - [x] 2.5 Implement backward compatibility features
    - Support all existing voice features (interruption, sentiment, workflow updates)
    - Maintain existing event format for frontend compatibility
    - Support existing persona voice configuration
    - _Requirements: 2.7, 2.8, 6.7_

- [x] 3. Implement Text Adapter wrapper
  - [x] 3.1 Create text-adapter.ts with TextAdapter class
    - Implement constructor accepting AgentCore
    - Implement startTextSession method
    - Implement stopTextSession method
    - Implement handleUserInput method
    - Implement sendResponse method
    - Implement sendToolResult method
    - Implement sendHandoffRequest method
    - Implement sendError method
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 3.2 Write property test for adapter forwarding consistency (text)
    - **Property 2: Adapter Forwarding Consistency**
    - **Validates: Requirements 3.2, 3.3, 3.7**

  - [x] 3.3 Write property test for text session lifecycle management
    - **Property 5: Text Session Lifecycle Management**
    - **Validates: Requirements 3.4**

  - [x] 3.4 Implement backward compatibility features
    - Echo user messages as transcripts for frontend display
    - Support existing tool execution format
    - Support existing handoff request format
    - Maintain existing event format for frontend compatibility
    - _Requirements: 3.6, 3.7, 6.7_

- [x] 4. Checkpoint - Ensure core components work in isolation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement tool execution in Agent Core
  - [x] 5.1 Implement tool execution pipeline
    - Detect tool type (handoff, banking, knowledge base, etc.)
    - Validate tool input against tool schema
    - Route tool to appropriate service (local-tools, AgentCore)
    - Execute tool via ToolsClient
    - Handle tool results and errors
    - Send results back to LLM (via adapter)
    - Track tool execution in Langfuse
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x] 5.2 Write property test for tool execution pipeline
    - **Property 6: Tool Execution Pipeline**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 5.3 Write property test for tool error handling
    - **Property 7: Tool Error Handling**
    - **Validates: Requirements 8.5, 12.2**

  - [x] 5.4 Write property test for tool result caching
    - **Property 8: Tool Result Caching**
    - **Validates: Requirements 8.6**

- [x] 6. Implement handoff management in Agent Core
  - [x] 6.1 Implement handoff detection and routing
    - Detect handoff tool calls (transfer_to_*, return_to_triage)
    - Extract handoff context (reason, verified user, user intent)
    - Build handoff request with full LangGraph state
    - Send handoff_request to Gateway (via adapter)
    - Handle return handoffs with task completion status
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [x] 6.2 Write property test for handoff detection and routing
    - **Property 9: Handoff Detection and Routing**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [x] 6.3 Write property test for handoff context preservation
    - **Property 10: Handoff Context Preservation**
    - **Validates: Requirements 9.5, 9.6**

  - [x] 6.4 Write property test for return handoff completion status
    - **Property 11: Return Handoff Completion Status**
    - **Validates: Requirements 9.7**

- [x] 7. Implement session memory management in Agent Core
  - [x] 7.1 Implement memory storage and restoration
    - Store verified user data after IDV checks
    - Store user intent for handoff context
    - Restore session memory from Gateway on session init
    - Notify Gateway via update_memory on memory changes
    - Clear session memory on session end
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.7_

  - [x] 7.2 Implement context injection into system prompts
    - Inject verified user data into system prompt
    - Inject user intent into system prompt
    - Format context for LLM awareness
    - Support all memory keys (verified, userName, account, sortCode, userIntent)
    - _Requirements: 10.5, 10.6_

  - [x] 7.3 Write property test for memory storage after IDV
    - **Property 12: Memory Storage After IDV**
    - **Validates: Requirements 10.1**

  - [x] 7.4 Write property test for memory restoration on session init
    - **Property 13: Memory Restoration on Session Init**
    - **Validates: Requirements 10.3**

  - [x] 7.5 Write property test for memory synchronization
    - **Property 14: Memory Synchronization**
    - **Validates: Requirements 10.4**

  - [x] 7.6 Write property test for context injection into prompts
    - **Property 15: Context Injection into Prompts**
    - **Validates: Requirements 10.5**

  - [x] 7.7 Write property test for memory cleanup on session end
    - **Property 16: Memory Cleanup on Session End**
    - **Validates: Requirements 10.7**

- [x] 8. Checkpoint - Ensure business logic works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Unified Runtime
  - [x] 9.1 Create agent-runtime-unified.ts with UnifiedRuntime class
    - Implement constructor accepting UnifiedRuntimeConfig
    - Load MODE environment variable ('voice', 'text', 'hybrid')
    - Load workflow definition from WORKFLOW_FILE
    - Load persona configuration if specified
    - Initialize Agent Core
    - Initialize Voice Side-Car (if voice or hybrid mode)
    - Initialize Text Adapter (if text or hybrid mode)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 9.2 Implement WebSocket connection handling
    - Handle new WebSocket connections
    - Route session_init messages to appropriate adapter(s)
    - Route audio data to Voice Side-Car (if voice or hybrid)
    - Route text messages to Text Adapter (if text or hybrid)
    - Handle session cleanup on disconnect
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.3 Implement Gateway integration
    - Register with Gateway on startup
    - Send heartbeat every 15 seconds
    - Handle graceful shutdown
    - Support all modes (voice, text, hybrid)
    - _Requirements: 4.6, 4.7_

  - [x] 9.4 Write property test for session state across mode switches
    - **Property 3: Session State Persistence**
    - **Validates: Requirements 4.8**

- [x] 10. Implement observability integration
  - [x] 10.1 Integrate Langfuse in Agent Core
    - Initialize Langfuse client
    - Track session start and end events
    - Track user inputs and assistant responses
    - Track tool invocations and results
    - Track latency metrics (time to first token, total duration)
    - Track token usage (input, output, total)
    - Track interruptions and errors as events
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 10.2 Write property test for session event tracking
    - **Property 17: Session Event Tracking**
    - **Validates: Requirements 11.2**

  - [x] 10.3 Write property test for message tracking
    - **Property 18: Message Tracking**
    - **Validates: Requirements 11.3**

  - [x] 10.4 Write property test for tool invocation tracking
    - **Property 19: Tool Invocation Tracking**
    - **Validates: Requirements 11.4**

  - [x] 10.5 Write property test for latency tracking
    - **Property 20: Latency Tracking**
    - **Validates: Requirements 11.5**

  - [x] 10.6 Write property test for token usage tracking
    - **Property 21: Token Usage Tracking**
    - **Validates: Requirements 11.6**

  - [x] 10.7 Write property test for error and interruption tracking
    - **Property 22: Error and Interruption Tracking**
    - **Validates: Requirements 11.7**

- [x] 11. Implement error handling
  - [x] 11.1 Implement configuration error handling
    - Validate workflow file exists
    - Validate persona file exists (if specified)
    - Validate AWS credentials (voice mode only)
    - Validate MODE environment variable
    - Provide clear error messages for missing files
    - Exit process for critical errors
    - _Requirements: 12.5, 12.6_

  - [x] 11.2 Implement runtime error handling
    - Handle SonicClient startup failures
    - Handle WebSocket connection drops
    - Handle tool execution failures
    - Handle workflow execution failures
    - Log errors with stack traces
    - Send error messages to client
    - Clean up resources on errors
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_

  - [x] 11.3 Write property test for voice session startup error handling
    - **Property 23: Voice Session Startup Error Handling**
    - **Validates: Requirements 12.1**

  - [x] 11.4 Write property test for connection drop cleanup
    - **Property 24: Connection Drop Cleanup**
    - **Validates: Requirements 12.3**

  - [x] 11.5 Write property test for workflow execution error handling
    - **Property 25: Workflow Execution Error Handling**
    - **Validates: Requirements 12.4, 12.7**

  - [x] 11.6 Write property test for missing configuration error handling
    - **Property 26: Missing Configuration Error Handling**
    - **Validates: Requirements 12.6**

- [x] 12. Checkpoint - Ensure error handling works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create test fixtures and mocks
  - [x] 13.1 Create mock SonicClient for testing
    - Implement MockSonicClient class
    - Support startSession, sendAudioChunk, sendText, stopSession
    - Support event emission for testing
    - _Requirements: 13.2_

  - [x] 13.2 Create mock WebSocket for testing
    - Implement MockWebSocket class
    - Track sent messages
    - Support event handlers
    - _Requirements: 13.3_

  - [x] 13.3 Create test workflows and personas
    - Create test workflow definitions
    - Create test persona configurations
    - Create test tool definitions
    - _Requirements: 13.4, 13.5_

- [x] 14. Write integration tests
  - [x] 14.1 Write voice mode integration test
    - Test complete voice interaction flow
    - Test audio input and output
    - Test tool execution in voice mode
    - Test handoffs in voice mode
    - _Requirements: 13.6_

  - [x] 14.2 Write text mode integration test
    - Test complete text interaction flow
    - Test text input and output
    - Test tool execution in text mode
    - Test handoffs in text mode
    - _Requirements: 13.6_

  - [x] 14.3 Write hybrid mode integration test
    - Test voice and text simultaneously
    - Test mode switching
    - Test session state preservation
    - _Requirements: 13.6_

- [x] 15. Migrate existing agents
  - [x] 15.1 Update triage agent configuration
    - Set MODE=voice in environment
    - Update Docker configuration
    - Test triage agent with new runtime
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 15.2 Update banking agent configuration
    - Set MODE=voice in environment
    - Update Docker configuration
    - Test banking agent with new runtime
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 15.3 Update IDV agent configuration
    - Set MODE=voice in environment
    - Update Docker configuration
    - Test IDV agent with new runtime
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 15.4 Update disputes agent configuration
    - Set MODE=voice in environment
    - Update Docker configuration
    - Test disputes agent with new runtime
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 15.5 Write migration compatibility tests
    - Test all existing agents work with new runtime
    - Test all existing tools work
    - Test all existing personas work
    - Test all existing workflows work
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 16. Delete old runtime files
  - [x] 16.1 Delete agent-runtime-s2s.ts
    - Verify all functionality migrated to new architecture
    - Delete file (983 lines)
    - _Requirements: 7.1_

  - [x] 16.2 Delete agent-runtime.ts
    - Verify all functionality migrated to new architecture
    - Delete file (200 lines)
    - _Requirements: 7.2_

- [x] 17. Update documentation
  - [x] 17.1 Update README.md
    - Document new architecture
    - Document MODE environment variable
    - Document how to add new agents
    - Provide migration guide for existing agents
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 17.2 Update Docker configurations
    - Update docker-compose.yml with MODE variable
    - Update Dockerfiles if needed
    - Document deployment for all modes
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 17.3 Create developer guide
    - Document Agent Core interface
    - Document Voice Side-Car interface
    - Document Text Adapter interface
    - Document Unified Runtime interface
    - Provide code examples for adding new agents
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 18. Final checkpoint - Ensure all tests pass and documentation is complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- Migration tests ensure backward compatibility
