# Visual Workflow Editor

The **Workflow Editor** allows you to design complex, multi-step behaviors for your agents using a drag-and-drop interface.

## Accessing the Editor
Navigate to `/workflow-editor.html` or click the **"Workflow Editor"** link/button in the main UI (if available) or simply open the file in your browser via the local server.

## Key Concepts

### 1. Nodes
- **Start Node**: The entry point of the conversation flow.
- **Listen Node**: Waits for user input.
- **Decision Node**: Branches logic based on conditions ("If user says X...").
- **Tool Node**: Executes a specific tool (e.g., `get_balance`).
- **Speak Node**: The AI responds with specific text or a generated phrase.
- **Handover Node**: Transfer control to a different agent or human.

### 2. Creating a Flow
1. Drag nodes from the palette onto the canvas.
2. Connect nodes by dragging wires from outputs to inputs.
3. Configure node properties (text, conditions, tool names) in the side panel.

### 3. Personas & Injection
Workflows are linked to **Personas**.
- Save your workflow as `workflow-{persona}.json` (e.g., `workflow-persona-mortgage.json`).
- When you select that Persona in the main voice assistant, the backend detects the workflow file.
- The logic is **automatically converted to text instructions** and injected into the System Prompt.

### Example Use Case: "Sci-Fi Bot"
1. **Start** -> **Speak** ("Welcome, traveler.")
2. **Listen** -> **Decision** (Input contains "Empire"?)
3. **True** -> **Tools** (Play Imperial March) -> **Speak** ("Long live the Empire.")
4. **False** -> **Speak** ("Move along.")

## Best Practices
- Keep flows linear where possible.
- Use explicit tool names that match your Tool Manager definitions.
- Test your flow using the "Dynamic Injection" feature to see how the prompt is generated.
