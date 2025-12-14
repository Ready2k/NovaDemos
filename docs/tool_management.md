# Tool Management Guide

The **Tool & Gateway Manager** allows you to seamlessly configure, categorize, and extend the capabilities of the Voice Assistant.

## Feature Overview

### 1. Tabbed Navigation
In the main **Tools Configuration** panel, tools are now organized into tabs for easier access:
- **Banking**: Core banking operations (Balance, Transactions, Disputes).
- **Mortgage**: Lending and property tools.
- **System**: Utility tools.
- **Other**: Custom or uncategorized tools.
- **[Dynamic Tabs]**: Any new category you create will automatically appear as its own tab.

### 2. Interactive Tool Manager
Access via the **"Manage Tools"** or **"Add Tool"** button in the sidebar.

#### Creating a New Tool
1. Click **New Tool**.
2. **Name**: Unique identifier (e.g., `get_weather`).
3. **Category**:
   - Select an existing category from the dropdown.
   - Or select **"[+] Create New Category..."** to type a custom name (e.g., "Finance").
4. **Description**: Brief explanation of what the tool does.
5. **Schema**: Define input parameters visually or via raw JSON.
6. **Instruction**: Guide the AI on when/how to use this tool.

#### Editing Tools
- Click any tool in the list to edit its properties.
- Update its **Category** to move it to a different tab in the main UI.

### 3. Categories
- Categories are stored directly in the tool's JSON definition (`"category": "Banking"`).
- The main UI dynamically renders tabs based on the categories present in your loaded tools.
- **"Select All" / "Deselect All"** buttons apply globally across all tabs.

## Gateway Integration
You can import definitions directly from your AgentCore Gateway:
1. Click **Import Gateway**.
2. Select a tool from the list.
3. The system pre-fills the Name, Target, and Description.
4. You can then assign a Category and Save.
