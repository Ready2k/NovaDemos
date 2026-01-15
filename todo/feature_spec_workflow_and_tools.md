# Feature Specification: Live Workflow Visualiser & Tool Bindings

This document outlines the design and implementation plan for two key features: **Live Session Check Verification** and **Dynamic Tool Bindings**. Use this guide to re-implement these features cleanly in a fresh codebase.

---

## 1. Live Session 'Current Step Workflow' Visualiser

### Objective
Provide real-time visibility into the agent's state, specifically showing which workflow is active (e.g., "Banking Master", "ID&V") and the status of critical data checks (e.g., "Account Number Provided: TRUE").

### Architecture
The system relies on a **Server-Push** model where the backend broadcasts state changes to the frontend via WebSocket.

#### A. Backend Logic
1.  **State Tracking:** Maintain a lightweight state object on the `ClientSession`.
    ```typescript
    interface WorkflowState {
        currentWorkflow: string; // e.g., "idv", "banking"
        currentStep: string;     // e.g., "check_auth"
        checks: {
            [key: string]: boolean; // e.g., "account_verified": true
        };
    }
    ```
2.  **Broadcast Event:** Whenever the state changes (e.g., entering a new node or a tool updating a verified status), emit a WebSocket event.
    ```json
    {
        "type": "workflow_update",
        "data": {
            "workflowId": "idv",
            "activeStep": "collect_details",
            "checks": {
                "identity_verified": false,
                "account_found": true
            }
        }
    }
    ```

#### B. Frontend UI
1.  **Active Workflow Indicator:** A badge or label in the header showing the Current Workflow Name.
2.  **Live Checks Panel:** A dynamic list of boolean checks.
    *   **Visuals:** Use Green Checkmarks (✅) for `true` and Red Crosses/Gray Circles for `false`.
    *   **Animation:** Pulse effects when a status changes to draw attention.

#### C. Implementation Steps
1.  **Modify `server.ts`**: Add `broadcastWorkflowState(session)` helper. Call it when `start_workflow` is triggered or when specific tools (like `perform_idv_check`) return success.
2.  **Modify `main.js`**: Add a listener for `workflow_update`. Update the DOM elements `#workflow-indicator` and `#checks-list`.

---

## 2. Tool Bindings Service & Interface

### Objective
Decouple tool availability from hardcoded logic. Allow administrators to define exactly which tools are available to the agent in specific contexts (Global vs. Workflow-Specific) via a configuration file and UI.

### Architecture
The core concept is **Context-Aware Tooling**. The agent should not have access to "Mortgage Calculator" when it is in the "Dispute Resolution" workflow.

#### A. Data Structure (`tool-bindings.json`)
A central JSON file defines the relationships.
```json
{
  "global": [
    "get_server_time",
    "start_workflow",   // CRITICAL: Must be global to allow switching
    "end_session"
  ],
  "workflows": {
    "banking-master": [
      "manage_recent_interactions",
      "check_balance"
    ],
    "idv": [
      "perform_idv_check",
      "lookup_account"
    ],
    "disputes": [
      "create_dispute_case",
      "lookup_transaction"
    ]
  }
}
```

#### B. Backend Service (`ToolManager`)
1.  **Loader:** Load `tool-bindings.json` on startup.
2.  **Filtering Logic:** When generating the `tools` array for the LLM's system prompt:
    *   `Available Tools = Global Tools + Current Workflow Tools`
3.  **Validation:** In `handleSonicEvent` (or tool execution handler), verify that the requested tool is actually allowed in the current context before executing.

#### C. Frontend Interface (The "Coupler")
1.  **UI Layout:** A "Tool Manager" modal or sidebar panel.
2.  **Matrix View:**
    *   Rows: Available Workflows (Banking, ID&V, Disputes).
    *   Columns/List: Available Tools.
    *   Interaction: Checkboxes to toggle whether Tool X is active in Workflow Y.
3.  **Persistence:** Clicking "Save" writes the updated matrix back to `tool-bindings.json`.

### Implementation Pitfalls to Avoid (Lessons Learned)
*   **DO NOT Restart Sessions:** Do not implement logic that requires `stopSession()` / `startSession()` to change tools. Instead, update the `session.allowedTools` array in memory and instruct the LLM that its capabilities have changed.
*   **Global "Start" Tool:** The tool used to switch workflows (`start_workflow`) MUST be globally available, or the agent will get stuck in a sub-workflow with no way to exit.
