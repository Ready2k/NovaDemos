fix langfuse integration
 - Save and push Prompts is not working
  - Lets add the Langfuse Prompt management so we can select prompt versions
  example code 
    // promptService.js
import { Langfuse } from "langfuse";

// Initialize with Secret Key (Keep this server-side only!)
const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://cloud.langfuse.com" // or your host
});

const PROMPT_NAME = "customer-support-agent";

/**
 * 1. GET LATEST (Sync)
 * cacheTtlSeconds: 0 forces a fresh pull from Langfuse servers
 */
export async function getLatestPrompt() {
  try {
    console.log(`Fetching '${PROMPT_NAME}'...`);
    
    // getPrompt(name, version, options)
    // version: undefined (to use label instead)
    const prompt = await langfuse.getPrompt(PROMPT_NAME, undefined, {
      label: "production", // or "latest"
      cacheTtlSeconds: 0   // 0 = Disable cache / Instant Sync
    });

    // Compile helps if you want to preview variables immediately, 
    // but here we return raw text for editing.
    return {
      text: prompt.prompt,
      config: prompt.config,
      version: prompt.version
    };
  } catch (error) {
    console.error("Prompt not found, returning defaults.");
    return {
      text: "You are a helpful assistant.",
      config: { temperature: 0.5 },
      version: 0
    };
  }
}

/**
 * 2. SAVE & TAG
 * Creates a new version and updates the "production" tag
 */
export async function saveNewPromptVersion(newText, newConfig) {
  console.log("Saving new version...");

  // Creating a prompt with the same name = New Version
  const newPrompt = await langfuse.createPrompt({
    name: PROMPT_NAME,
    prompt: newText,
    config: newConfig || {},
    labels: ["latest", "dev"], // Initial tags
    type: "chat"
  });

  console.log(`Saved Version: ${newPrompt.version}`);

  // 3. PROMOTE / TAG
  // Move 'production' label to this new version
  await langfuse.updatePrompt({
    name: PROMPT_NAME,
    version: newPrompt.version,
    newLabels: ["production"]
  });

  return newPrompt.version;
}

example front end code 
// PromptEditor.jsx
import React, { useState, useEffect } from 'react';

const PromptEditor = () => {
  const [promptText, setPromptText] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  // 1. Pull down the latest on mount
  useEffect(() => {
    fetchLatest();
  }, []);

  const fetchLatest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompt');
      const data = await res.json();
      setPromptText(data.text);
      setVersion(data.version);
    } catch (err) {
      console.error("Failed to fetch prompt", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Save as new version
  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: promptText,
          config: { temperature: 0.7 } // You can make this dynamic too
        })
      });
      const data = await res.json();
      
      alert(`Saved! New version is v${data.version}`);
      // Optional: re-fetch to confirm sync
      fetchLatest(); 
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Prompt Manager</h2>
      <p>Current Production Version: <strong>v{version}</strong></p>
      
      <textarea 
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        rows={10}
        style={{ width: '100%', padding: '10px' }}
      />
      
      <div style={{ marginTop: '10px' }}>
        <button onClick={handleSave} disabled={loading}>
          {loading ? 'Syncing...' : 'Save & Promote to Prod'}
        </button>
        <button onClick={fetchLatest} disabled={loading} style={{ marginLeft: '10px' }}>
          Reset to Latest
        </button>
      </div>
    </div>
  );
};

export default PromptEditor;

Key Implementation Details
cacheTtlSeconds: 0: In the Node backend (getPrompt), this is the most important setting. It ensures that when you click "Reset to Latest" in React, you are truly getting what is on the server, not a cached version from 60 seconds ago.

updatePrompt (Promote): In saveNewPromptVersion, notice that we call updatePrompt immediately after creating the prompt. This automatically handles the logic of removing the "production" tag from the old version (e.g., v5) and adding it to the new one (v6).

Security: The LANGFUSE_SECRET_KEY stays in your .env file on the server. The React app only knows about your /api/prompt endpoints.


 - Scores are not being pushed 
    * [Server] Feedback Debug: traceId=undefined, sessionId=undefined, targetId=undefined, score=0

Fix Sentiment 
  - should start at netural and change based on the conversation - its starting too low, negative 0% - should start at 50% neutral