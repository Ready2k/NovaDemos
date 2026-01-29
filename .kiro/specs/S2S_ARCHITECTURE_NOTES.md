# Speech-to-Speech (S2S) Architecture Considerations

## Critical Understanding

This system is fundamentally built on **Nova Sonic's Speech-to-Speech (S2S) protocol**, not traditional text-based chat. This has profound implications for the A2A architecture.

## S2S Flow Architecture

```
User (Speaking)
    ↓ [Audio Stream]
Gateway
    ↓ [Audio Stream]
Agent Container (Triage/Banking/etc)
    ↓ [Audio Stream]
Nova Sonic S2S Session
    ↓ [Speech Recognition + LLM + Tool Calling + Speech Synthesis]
    ↓ [Audio Stream]
Agent Container
    ↓ [Audio Stream]
Gateway
    ↓ [Audio Stream]
User (Hearing)
```

## Key Architectural Principles

### 1. Agents Are Audio Proxies, Not Processors

**Agents DON'T:**
- Process or analyze audio
- Perform speech-to-text (STT)
- Perform text-to-speech (TTS)
- Call tools directly
- Generate responses

**Agents DO:**
- Forward audio bidirectionally
- Maintain Nova Sonic S2S session
- Track workflow state in LangGraph
- Orchestrate handoffs
- Monitor session health

### 2. Nova Sonic Does Everything Speech-Related

**Nova Sonic Handles:**
- Speech recognition (STT)
- Natural language understanding
- Tool calling via S2S protocol
- Response generation
- Speech synthesis (TTS)
- Conversation context
- Audio streaming

### 3. Dual State Management

**Graph State (LangGraph):**
- Current workflow node
- Workflow history
- Decision outcomes
- Sub-workflow stack
- Extracted entities

**S2S Session State (Nova Sonic):**
- Conversation history
- Audio session parameters
- Voice ID and language
- Tool call history
- User context

**Both must be synchronized during handoffs!**

## Critical S2S Challenges

### Challenge 1: Audio Continuity During Handoffs

**Problem:**
- User is speaking to Agent A
- Workflow triggers handoff to Agent B
- Audio session must transfer without dropout

**Solution:**
1. Agent A signals handoff to Gateway
2. Gateway buffers audio during transition
3. Agent B initializes new Nova Sonic S2S session with inherited context
4. Gateway switches audio routing to Agent B
5. Audio continues seamlessly (target: < 500ms latency)

**Failure Mode:**
- If Agent B's S2S session fails to initialize, fall back to Agent A
- User hears brief "transferring..." message during handoff

### Challenge 2: Tool Calling in S2S Mode

**Problem:**
- Tools must be called during speech interaction
- Tool execution must not block audio streaming
- Tool results must be spoken back to user

**Solution:**
- Nova Sonic handles tool calling via S2S protocol
- Agent tracks tool calls in graph state
- Tool results flow through Nova Sonic's speech synthesis
- Audio streaming continues during tool execution

**NOT:**
- ~~Agent calls tools directly~~
- ~~Agent converts tool results to speech~~
- ~~Agent blocks audio during tool execution~~

### Challenge 3: Workflow State vs Conversation State

**Problem:**
- LangGraph tracks workflow position (which node we're on)
- Nova Sonic tracks conversation context (what was said)
- These can diverge during complex interactions

**Solution:**
- Workflow state is injected into Nova Sonic's system prompt
- Nova Sonic outputs workflow step markers: `[STEP: node_id]`
- Agent parses markers to keep graph state synchronized
- During handoffs, both states are transferred

**Example:**
```
User: "I want to check my balance"
Nova Sonic: [STEP: authenticate] "I'll need to verify your identity first..."
Agent: Updates graph state to 'authenticate' node
Nova Sonic: Calls perform_idv_check tool
Nova Sonic: [STEP: check_balance] "Your balance is $1,234.56"
Agent: Updates graph state to 'check_balance' node
```

### Challenge 4: Multi-Agent Consultation in S2S

**Problem:**
- Agent A needs information from Agent B
- User is in active S2S session with Agent A
- Consultation must not disrupt user's audio experience

**Solution:**
- Agent A pauses its S2S session (brief hold music?)
- Agent A sends consultation request to Agent B via Gateway
- Agent B processes request (may use its own S2S session)
- Agent B returns result to Agent A
- Agent A resumes S2S session with user
- Agent A speaks the consulted information

**Alternative (Seamless):**
- Agent A's Nova Sonic session calls a "consult_agent" tool
- Tool execution happens in background
- Nova Sonic speaks result when tool returns
- User doesn't perceive any handoff

### Challenge 5: Latency Constraints

**S2S Latency Budget:**
- User speech → Nova Sonic: < 100ms
- Nova Sonic processing: < 1000ms
- Nova Sonic → User audio: < 100ms
- **Total: < 1200ms for natural conversation**

**Graph Execution Must Not Block Audio:**
- Graph state updates: < 50ms
- Workflow transitions: < 100ms
- Handoff decisions: < 200ms
- **Graph operations run in parallel with audio streaming**

## Implementation Implications

### Phase 3: LangGraph Conversion

**Must Include:**
- Nova Sonic S2S session management in agent runtime
- Audio packet forwarding (bidirectional, non-blocking)
- Workflow context injection into S2S session config
- Session cleanup on disconnect
- Audio continuity during workflow transitions

**New Components:**
- `S2SSessionManager` - Manages Nova Sonic sessions per agent
- `AudioForwarder` - Handles bidirectional audio streaming
- `WorkflowContextInjector` - Injects workflow state into S2S prompts

### Phase 4: Full A2A

**Must Include:**
- S2S session state in handoff context
- Audio buffering during handoffs
- Voice/persona continuity across agents
- Consultation protocol that doesn't break audio

**New Components:**
- `S2SHandoffProtocol` - Manages S2S session transfer
- `AudioBufferManager` - Buffers audio during transitions
- `VoicePersonaManager` - Ensures voice consistency

### Phase 5: Deprecation

**Must Preserve:**
- All S2S functionality
- Audio streaming performance
- Tool calling via S2S
- Handoff audio continuity

**Can Remove:**
- Text injection workflow system
- `[STEP:]` tag parsing (replaced by graph events)
- Dual-mode configuration

## Testing Considerations

### S2S-Specific Tests

**Audio Continuity:**
- Test audio streaming during normal operation
- Test audio during workflow transitions
- Test audio during agent handoffs
- Measure audio latency and dropouts

**Tool Calling:**
- Test tool execution during S2S session
- Verify tool results are spoken correctly
- Test tool execution doesn't block audio

**Handoffs:**
- Test S2S session transfer between agents
- Verify conversation context is preserved
- Measure handoff latency
- Test fallback when handoff fails

**Load Testing:**
- Multiple concurrent S2S sessions
- Audio quality under load
- Handoff performance under load

## Monitoring and Observability

### S2S-Specific Metrics

**Audio Quality:**
- Audio latency (target: < 100ms)
- Audio dropouts (target: 0%)
- Audio jitter (target: < 50ms)

**S2S Session Health:**
- Session initialization time
- Session duration
- Session failure rate
- Tool call latency within S2S

**Handoff Performance:**
- Handoff latency (target: < 500ms)
- Handoff success rate (target: > 95%)
- Audio continuity during handoff
- Context preservation rate

## Common Pitfalls to Avoid

### ❌ Don't: Process Audio in Agents
Agents should forward audio, not process it. All audio processing happens in Nova Sonic.

### ❌ Don't: Call Tools Directly from Agents
Tools are called by Nova Sonic via S2S protocol, not by agents.

### ❌ Don't: Block Audio Streaming
Graph execution must run in parallel with audio streaming, never block it.

### ❌ Don't: Forget S2S State in Handoffs
Both graph state AND S2S session state must be transferred during handoffs.

### ❌ Don't: Assume Text-Based Patterns
This is speech-first. Text transcripts are secondary, for debugging and visualization.

## Success Criteria

### Audio Experience
- ✅ Natural conversation flow (< 1200ms latency)
- ✅ No audio dropouts during normal operation
- ✅ Seamless handoffs (< 500ms, no dropouts)
- ✅ Clear, natural speech synthesis

### Workflow Integration
- ✅ Workflow state synchronized with conversation
- ✅ Tool calls execute without blocking audio
- ✅ Handoffs preserve both workflow and conversation context

### Reliability
- ✅ S2S session stability (> 99% uptime)
- ✅ Handoff success rate (> 95%)
- ✅ Graceful degradation on failures

## References

- Nova Sonic S2S Documentation: [AWS Bedrock Nova Sonic]
- LangGraph Documentation: [LangChain LangGraph]
- Audio Streaming Best Practices: [WebRTC, WebSocket Audio]
- Handoff Protocols: [Agent-to-Agent Communication Patterns]

---

**Last Updated:** 2026-01-29  
**Status:** Architecture guidance for Phase 3, 4, 5 implementation
