# Context Order Fix - Visual Diagram

## The Problem

### Before Fix (Wrong Order) ❌

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (What Nova Sonic Reads)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. ### BANKING SPECIALIST - ACCOUNT SERVICES ###           │
│    You are a banking specialist...                         │
│                                                             │
│    **CRITICAL: CHECK THE CONTEXT ABOVE**  ← 😕 What context?│
│    - Customer name (already verified)                      │
│    - Account details (already verified)                    │
│    - What they originally requested                        │
│                                                             │
│    YOU MUST act on this context immediately!               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 2. ### CURRENT SESSION CONTEXT ###         ← 🔴 TOO LATE!  │
│    User's Original Request: balance check                  │
│    Customer Name: Sarah Johnson                            │
│    Account Number: 12345678                                │
│    Sort Code: 112233                                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 3. ### AGENT HANDOFF INSTRUCTIONS ###                      │
│    [Handoff tools...]                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 4. ### WORKFLOW INSTRUCTIONS ###                           │
│    [Workflow steps...]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Result: Nova Sonic reads "CHECK THE CONTEXT ABOVE" but context is below!
        Banking agent asks "How can I help you?" ❌
```

### After Fix (Correct Order) ✅

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (What Nova Sonic Reads)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. ### CURRENT SESSION CONTEXT ###         ← 🟢 FIRST!     │
│    User's Original Request: balance check                  │
│    Customer Name: Sarah Johnson                            │
│    Account Number: 12345678                                │
│    Sort Code: 112233                                       │
│                                                             │
│    **CRITICAL INSTRUCTION:**                               │
│    - Customer is already verified                          │
│    - User's request mentions "balance check"               │
│    - ACT ON IT IMMEDIATELY                                 │
│    - DO NOT ask "How can I help you?"                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 2. ### BANKING SPECIALIST - ACCOUNT SERVICES ###           │
│    You are a banking specialist...                         │
│                                                             │
│    **CRITICAL: LOOK AT THE SECTION ABOVE THIS** ← ✅ Found!│
│    It contains "CURRENT SESSION CONTEXT" with:             │
│    - User's Original Request (what they want)              │
│    - Customer Name (already verified)                      │
│    - Account Number (already verified)                     │
│    - Sort Code (already verified)                          │
│                                                             │
│    **IF YOU SEE "User's Original Request" ABOVE:**         │
│    - DO NOT ask "How can I help you?"                      │
│    - ACT IMMEDIATELY on their request                      │
│                                                             │
│    ### YOUR PROCESS ###                                    │
│    STEP 1: CHECK THE CONTEXT SECTION ABOVE                 │
│    STEP 2: IF YOU SEE "User's Original Request: balance"   │
│            "Hello Sarah, let me fetch your balance..."     │
│            [CALL: agentcore_balance]                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 3. ### AGENT HANDOFF INSTRUCTIONS ###                      │
│    [Handoff tools...]                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 4. ### WORKFLOW INSTRUCTIONS ###                           │
│    [Workflow steps...]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Result: Nova Sonic sees context FIRST, then reads instructions!
        Banking agent acts immediately: "Hello Sarah, let me fetch your balance..." ✅
```

## How Nova Sonic Reads the Prompt

### Before Fix ❌

```
Nova Sonic Reading Sequence:
┌──────────────────────────────────────────────────────────┐
│ Step 1: Read Persona Prompt                              │
│         "CHECK THE CONTEXT ABOVE"                        │
│         😕 What context? I don't see any context above!  │
├──────────────────────────────────────────────────────────┤
│ Step 2: Read Context (too late)                          │
│         "User's Original Request: balance check"         │
│         🤔 Oh, there's the context... but I already      │
│            read the instructions that said to check it!  │
├──────────────────────────────────────────────────────────┤
│ Step 3: Start Session                                    │
│         💬 "Hello Sarah, how can I help you today?"      │
│         ❌ Didn't act on userIntent                      │
└──────────────────────────────────────────────────────────┘
```

### After Fix ✅

```
Nova Sonic Reading Sequence:
┌──────────────────────────────────────────────────────────┐
│ Step 1: Read Context FIRST                               │
│         "User's Original Request: balance check"         │
│         "Customer Name: Sarah Johnson"                   │
│         "Account: 12345678, Sort Code: 112233"           │
│         ✅ Got it! User wants balance check.             │
├──────────────────────────────────────────────────────────┤
│ Step 2: Read Persona Prompt                              │
│         "LOOK AT THE SECTION ABOVE THIS"                 │
│         ✅ Yes! I see the context above!                 │
│         "IF YOU SEE 'User's Original Request' ABOVE:"    │
│         ✅ I do see it! It says "balance check"          │
│         "ACT IMMEDIATELY on their request"               │
│         ✅ Will do!                                       │
├──────────────────────────────────────────────────────────┤
│ Step 3: Start Session                                    │
│         💬 "Hello Sarah, let me fetch your balance..."   │
│         🔧 [Calls agentcore_balance immediately]         │
│         ✅ Acting on userIntent!                         │
└──────────────────────────────────────────────────────────┘
```

## Code Change

### agents/src/agent-runtime-s2s.ts

```typescript
// BEFORE (Wrong Order) ❌
systemPrompt = `${personaPrompt}${contextInjection}${handoffInstructions}...`;
//              ↑ Instructions  ↑ Context (too late!)

// AFTER (Correct Order) ✅
systemPrompt = `${contextInjection}${personaPrompt}${handoffInstructions}...`;
//              ↑ Context FIRST!  ↑ Instructions (can reference context above)
```

## Why This Matters

### Sequential Reading
Nova Sonic reads the system prompt **sequentially** from top to bottom:
1. First thing it sees = first thing it knows
2. Instructions that reference "above" need context to be above them
3. Context that comes after instructions is too late

### Reference Resolution
When Nova Sonic reads "CHECK THE CONTEXT ABOVE":
- ❌ If context is below: Nova Sonic doesn't know what to check
- ✅ If context is above: Nova Sonic can look up and find it

### Instruction Following
Nova Sonic follows instructions based on what it has seen:
- ❌ "Act on userIntent" but userIntent not seen yet = can't act
- ✅ "Act on userIntent" and userIntent already seen = can act immediately

## The Fix in Action

### User Journey with Correct Order

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Request                                             │
│    "I want to check my balance"                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Triage → IDV → Banking Handoff                           │
│    Gateway stores memory:                                   │
│    - userIntent: "balance check"                            │
│    - verified: true                                         │
│    - userName: "Sarah Johnson"                              │
│    - account: "12345678"                                    │
│    - sortCode: "112233"                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Banking Agent Session Init                               │
│    Constructs system prompt in CORRECT ORDER:               │
│                                                             │
│    [CONTEXT] ← User intent + verified user                  │
│    [PERSONA] ← Instructions to check context above          │
│    [HANDOFF] ← Handoff tools                                │
│    [WORKFLOW] ← Workflow steps                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Nova Sonic Reads Prompt                                  │
│    ✅ Sees context FIRST                                    │
│    ✅ Sees userIntent = "balance check"                     │
│    ✅ Sees verified user = "Sarah Johnson"                  │
│    ✅ Reads instructions to act immediately                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Banking Agent Response                                   │
│    💬 "Hello Sarah, let me fetch your balance for you..."   │
│    🔧 [Calls agentcore_balance(12345678, 112233)]           │
│    💬 "Your current balance is £1,234.56"                   │
│    🔄 [Calls return_to_triage]                              │
└─────────────────────────────────────────────────────────────┘
```

## Summary

**The Problem:** Context came after instructions that referenced it  
**The Solution:** Put context BEFORE instructions  
**The Result:** Nova Sonic can see and act on context immediately  

Simple fix, big impact! 🎉
