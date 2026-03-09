# Recent Interactions Feature — Implementation Tracker

Fires `manage_recent_interactions` async after IDV success. LLM predicts if the call is about a recent open interaction and re-affirms proactively if confident. Configurable via a new "Interactions" settings tab. Applies to all banking personas.

---

## Tasks

- [x] **1. Tool JSON** — Add `hoursWindow` and `maxCount` optional params to `tools/manage_recent_interactions.json`
- [x] **2. Settings type** — Add `recentInteractionsWindowHours?: number` and `recentInteractionsCount?: number` to `AppSettings` in `frontend-v2/lib/types/settings.ts`
- [x] **3. InteractionsSettings.tsx** — New settings tab component with two sliders (default 48h / 7 interactions)
- [x] **4. SettingsLayout.tsx** — Wire in the new 'interactions' tab
- [x] **5. Banking persona prompt** — Add post-IDV recent interactions instruction block to `backend/prompts/persona-banking_bot.txt`
- [x] **6. Workflow JSON** — Add `fetch_recent_interactions` node + edges between `idv_success` and `post_auth_route` in `backend/src/workflow-banking-disputes.json`
- [x] **7. server.ts** — Read `recentInteractionsWindowHours` / `recentInteractionsCount` from sessionConfig; inject configured values into system prompt
- [x] **8. Lambda** — Add env vars + system prompt instruction + tool definition + tool handler to `aws/lambdas/kvs-bridge/process-turn.js`

---

## Design Notes

- Settings: `recentInteractionsWindowHours` default=48, `recentInteractionsCount` default=7 (range 5–10)
- Mechanism: backend injects `[RECENT INTERACTIONS CONFIG]` block into system prompt with resolved values
- LLM behaviour: natural re-affirmation if confident — "I can see you were recently in touch about X, is that what you're calling about today?"
- Only re-affirm for **open** interactions (disputes not yet resolved, queries not yet closed)
- Applies to all banking personas (single file: `persona-banking_bot.txt`)
- Lambda: config via env vars `RECENT_INTERACTIONS_HOURS_WINDOW` / `RECENT_INTERACTIONS_MAX_COUNT`
