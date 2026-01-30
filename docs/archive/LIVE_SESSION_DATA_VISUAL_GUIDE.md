# Live Session Data - Visual Implementation Guide

## Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Home (page.tsx)                      │
│  - WebSocket connection                                 │
│  - Message handling                                     │
│  - Session state management                             │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  AppContext      │    │  InsightPanel        │
│  - currentSession│    │  - Display metrics   │
│  - updateSession │    │  - Format values     │
│  - messages      │    │  - Show sentiment    │
└──────────────────┘    └──────────────────────┘
        ▲                         │
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  useSessionStats       │
        │  - formatDuration      │
        │  - calculateCost       │
        │  - formatTokens        │
        └────────────────────────┘
```

## Data Flow Diagram

```
Backend WebSocket Messages
        │
        ├─ session_start
        │  └─ sessionId, timestamp
        │     └─ setCurrentSession()
        │
        ├─ metadata
        │  └─ detectedLanguage, languageConfidence
        │     └─ updateSessionStats()
        │
        ├─ usage / token_usage
        │  └─ inputTokens, outputTokens
        │     └─ updateSessionStats()
        │
        └─ (other messages)

AppContext (currentSession)
        │
        ├─ sessionId
        ├─ startTime ──────┐
        ├─ inputTokens     │
        ├─ outputTokens    │
        ├─ detectedLanguage│
        └─ languageConfidence
                           │
                           ▼
                useSessionStats Hook
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    Duration          Tokens              Cost
    (startTimeRef)    (inputTokens,       (calculateCost)
                      outputTokens)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    InsightPanel
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    Display          Display            Display
    Duration         Tokens             Cost
    (formattedDuration) (formatTokens)  ($formatCost)
```

## Session Duration Fix - Visual

### BEFORE (Broken)
```
Time: 0s    Time: 1s    Time: 2s    Time: 3s
│           │           │           │
startTime = now()   startTime = now()   startTime = now()
elapsed = 0         elapsed = 0         elapsed = 0
│           │           │           │
Display: 00:00  Display: 00:00  Display: 00:00  Display: 00:00
```

### AFTER (Fixed)
```
Time: 0s    Time: 1s    Time: 2s    Time: 3s
│           │           │           │
startTimeRef = now()
│           │           │           │
elapsed = 0 elapsed = 1 elapsed = 2 elapsed = 3
│           │           │           │
Display: 00:00  Display: 00:01  Display: 00:02  Display: 00:03
```

## Message Handler Flow

### Language Detection

```
Backend sends:
{
  "type": "metadata",
  "data": {
    "detectedLanguage": "en-US",
    "languageConfidence": 0.95
  }
}
        │
        ▼
Frontend receives in handleWebSocketMessage()
        │
        ├─ Check message.data?.detectedLanguage ✓
        ├─ Check message.detectedLanguage ✓
        │
        ▼
updateSessionStats({
  detectedLanguage: "en-US",
  languageConfidence: 0.95
})
        │
        ▼
AppContext updates currentSession
        │
        ▼
InsightPanel re-renders
        │
        ▼
Display: "en-US" (instead of "Detecting...")
```

### Token Usage

```
Backend sends (Format 1):
{
  "type": "usage",
  "data": {
    "inputTokens": 150,
    "outputTokens": 200
  }
}

OR (Format 2):
{
  "type": "token_usage",
  "inputTokens": 150,
  "outputTokens": 200
}
        │
        ▼
Frontend receives in handleWebSocketMessage()
        │
        ├─ Check message.inputTokens ✓
        ├─ Check message.data?.inputTokens ✓
        ├─ Check message.data?.totalInputTokens ✓
        │
        ▼
updateSessionStats({
  inputTokens: 150,
  outputTokens: 200
})
        │
        ▼
AppContext updates currentSession
        │
        ▼
useSessionStats calculates cost
        │
        ▼
InsightPanel displays:
- Input Tokens: 150
- Output Tokens: 200
- Cost: $0.045
```

## State Update Sequence

```
1. Session Starts
   ├─ WebSocket: session_start
   ├─ setCurrentSession({
   │  sessionId: "abc123",
   │  startTime: "2024-01-30T12:00:00Z",
   │  inputTokens: 0,
   │  outputTokens: 0,
   │  ...
   │})
   └─ useSessionStats initializes startTimeRef

2. Language Detected
   ├─ WebSocket: metadata
   ├─ updateSessionStats({
   │  detectedLanguage: "en-US",
   │  languageConfidence: 0.95
   │})
   └─ InsightPanel updates display

3. Tokens Used
   ├─ WebSocket: usage
   ├─ updateSessionStats({
   │  inputTokens: 150,
   │  outputTokens: 200
   │})
   └─ InsightPanel updates display

4. Duration Increments
   ├─ useSessionStats timer fires every 1s
   ├─ setDuration(elapsed)
   └─ InsightPanel updates display
```

## Component Render Flow

```
InsightPanel
    │
    ├─ useApp() → get currentSession
    ├─ useSessionStats() → get formatted values
    │
    ├─ Render Session Duration
    │  └─ formattedDuration (from useSessionStats)
    │
    ├─ Render Language
    │  └─ currentSession?.detectedLanguage
    │
    ├─ Render Sentiment
    │  └─ Calculate from messages
    │
    ├─ Render Turns
    │  └─ messages.length
    │
    ├─ Render Cost
    │  └─ formatCost(cost) with $ prefix
    │
    ├─ Render Input Tokens
    │  └─ formatTokens(inputTokens)
    │
    └─ Render Output Tokens
       └─ formatTokens(outputTokens)
```

## Dependency Graph

```
currentSession
    ├─ sessionId
    │  └─ useSessionStats (triggers timer)
    │
    ├─ startTime
    │  └─ startTimeRef (stored once, not recalculated)
    │
    ├─ inputTokens
    │  └─ useSessionStats (calculates cost)
    │     └─ InsightPanel (displays)
    │
    ├─ outputTokens
    │  └─ useSessionStats (calculates cost)
    │     └─ InsightPanel (displays)
    │
    ├─ detectedLanguage
    │  └─ InsightPanel (displays)
    │
    └─ languageConfidence
       └─ InsightPanel (displays as tooltip)

messages
    └─ InsightPanel
       ├─ Count for Turns
       └─ Analyze for Sentiment
```

## Timing Diagram

```
Time    Event                   Duration    Language    Tokens      Cost
────────────────────────────────────────────────────────────────────────
0s      Session starts          00:00       Detecting   0/0         $0.000
        ├─ sessionId set
        ├─ startTime set
        └─ startTimeRef init

1s      Timer tick              00:01       Detecting   0/0         $0.000

2s      Timer tick              00:02       Detecting   0/0         $0.000

3s      User sends message      00:03       Detecting   50/0        $0.000
        └─ inputTokens: 50

4s      Timer tick              00:04       Detecting   50/0        $0.000

5s      Language detected       00:05       en-US       50/0        $0.000
        └─ detectedLanguage set

6s      Assistant responds      00:06       en-US       50/75       $0.045
        ├─ outputTokens: 75
        └─ cost calculated

7s      Timer tick              00:07       en-US       50/75       $0.045
```

## Error Handling Flow

```
WebSocket Message Received
    │
    ├─ Parse message
    │  └─ If error → log and skip
    │
    ├─ Check message type
    │  └─ If unknown → skip
    │
    ├─ Extract data
    │  ├─ Check primary location
    │  ├─ Check fallback location 1
    │  ├─ Check fallback location 2
    │  └─ Use default if all fail
    │
    ├─ Validate data
    │  ├─ Check type
    │  ├─ Check range
    │  └─ If invalid → use default
    │
    ├─ Update state
    │  └─ If error → log and skip
    │
    └─ Log for debugging
       └─ Console.log with context
```

## Performance Optimization

```
BEFORE (Inefficient)
├─ startTime recalculated on every render
├─ Timer effect re-runs constantly
├─ Duration always near 0
└─ Component re-renders unnecessarily

AFTER (Optimized)
├─ startTime stored in ref (persistent)
├─ Timer effect runs once per session
├─ Duration increments properly
└─ Component re-renders only when data changes
```

---

This visual guide helps understand the complete flow of data through the Live Session Data interface.
