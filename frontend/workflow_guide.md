# How-To: Creating Dynamic Persona Flows (Sci-Fi Bot Example)

This guide walks you through creating a dynamic "Sci-Fi Bot" that changes its personality (e.g., Picard vs. Han Solo) based on user preference, using the **Workflow Creator**.

## 1. Prerequisites
- Ensure the **Backend Server** is running (`npm start`) to enable the new "Workflow Injection" feature.
- Open the **Workflow Creator** in your browser.

## 2. Select Your Persona
1. In the top toolbar, select **"Persona - Sci Fi Bot"** from the dropdown.
   > **Note**: This loads the base personality (Barbot). The workflow we build will *augment* this personality.

## 3. Build the Flow structure
We will create a flow that asks a question and branches based on the answer.

### Step A: The Start Node
1. Click **+ Add Node**.
2. Select it and edit:
   - **ID**: `start`
   - **Type**: `Start`
   - **Label**: `Greet User`
3. (Optional) You can leave this empty or add a specific greeting transition.

### Step B: The Question (Process Node)
1. Click **+ Add Node**.
2. Edit:
   - **ID**: `ask_preference`
   - **Type**: `Process`
   - **Label**: `Ask the user: "Are you more of a Star Trek diplomat or a Star Wars rebel?"`
   > **Tip**: The text in "Label" is the *instruction* to the AI.

### Step C: The Branches (Decision Logic)
Now create two different "End" states representing the different personas.

**Node 1: Picard Mode**
1. **+ Add Node**
2. **ID**: `mode_picard`
3. **Type**: `Process` (or `End` if it's the final state)
4. **Label**: `Adopting PERSONA: Jean-Luc Picard. Speak with diplomacy, authority, and reference Starfleet protocols. Quote Shakespeare occasionally.`

**Node 2: Han Solo Mode**
1. **+ Add Node**
2. **ID**: `mode_solo`
3. **Type**: `Process`
4. **Label**: `Adopting PERSONA: Han Solo. Speak like a scoundrel with a heart of gold. Be cocky, mention the Millennium Falcon, and never tell me the odds.`

## 4. Connect the Dots (Transitions)
Now link them together with logic.

1. **Connect `start` -> `ask_preference`**
   - No label needed (Automatic next step).

2. **Connect `ask_preference` -> `mode_picard`**
   - **From**: `ask_preference`
   - **To**: `mode_picard`
   - **Label / Condition**: `User chooses Star Trek / Diplomacy`

3. **Connect `ask_preference` -> `mode_solo`**
   - **From**: `ask_preference`
   - **To**: `mode_solo`
   - **Label / Condition**: `User chooses Star Wars / Rebel`

## 5. Save and Test
1. Click **💾 Save Workflow**.
2. The server will save this as `workflow-persona-sci_fi_bot.json`.
3. **Refresh the Page** (or restart the session).
4. **Speak to the Bot**:
   - *User*: "Hi!"
   - *Bot*: "Greetings! Are you more of a Star Trek diplomat or a Star Wars rebel?"
   - *User*: "Definitely a rebel."
   - *Bot*: "Kid, I've flown from one side of this galaxy to the other... let's talk business."

## How it Works Under the Hood
We updated the backend to **read your visual graph**.
1. It loads `workflow-persona-sci_fi_bot.json`.
2. It converts your graph into text instructions:
   ```text
   STEP [ask_preference]: "Ask the user..."
      - IF "Star Trek" -> GOTO [mode_picard]
      - IF "Star Wars" -> GOTO [mode_solo]
   ```
3. It appends this to the System Prompt, so the AI knows exactly what to do!
