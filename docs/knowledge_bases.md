# Knowledge Base Guide

Knowledge Bases (KBs) allow the Voice Assistant to access and retrieve specific information using RAG (Retrieval-Augmented Generation).

## Managing Knowledge Bases

### 1. Viewing KBs
The **Knowledge Bases** section in the sidebar lists all configured KBs. Each entry shows:
- **Name**: Human-readable name (e.g., "Mortgage Policy").
- **ID**: The unique AWS Knowledge Base ID.
- **Model**: The model used for retrieval/generation.

### 2. Adding a New KB
1. Scroll to **Add Knowledge Base** in the sidebar.
2. **Name**: Enter a descriptive name.
3. **Knowledge Base ID**: Paste the ID from your AWS Bedrock console.
4. **Model**: Select the AWS Bedrock model to associate with this KB.
5. Click **Add Knowledge Base**.

### 3. Editing a KB
- Click the **Edit** button next to any existing KB.
- Update the Name, ID, or Model.
- Click **Update Knowledge Base** to save changes.

## Using Knowledge Bases
The assistant uses the `search_knowledge_base` tool to query these sources.

- **Automatic Selection**: The system automatically converts your KBs into available "Knowledge Stores" for the AI.
- **Native Integration**: When you ask a question like "What are the mortgage rates?", the AI uses the `search_knowledge_base` tool.
- **Context**: The retrieved information is injected into the conversation context, allowing the AI to answer accurately.

**Note**: Ensure the `search_knowledge_base` tool is **Enabled** in the Mortgage tab (or whichever category assigned) for this to work.
