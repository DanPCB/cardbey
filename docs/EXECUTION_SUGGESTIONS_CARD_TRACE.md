# ExecutionSuggestionsCard – Where It’s Rendered and Why It Might Not Show

## 1. Where the card is rendered

| Layer | Location | Behavior |
|-------|----------|----------|
| **UI** | `apps/dashboard/cardbey-marketing-dashboard/src/pages/agent-chat/MessageRenderer.tsx` | For each message, `MessageRenderer` switches on `row.messageType`. When `messageType === 'execution_suggestions'` (lines 257–273), it renders `ExecutionSuggestionsCard` with `payload`, `missionId`, and `messageId`. |
| **Card** | `apps/dashboard/cardbey-marketing-dashboard/src/pages/agent-chat/cards/ExecutionSuggestionsCard.tsx` | Renders a “Suggested actions” section and one button per `payload.suggestions[]`. Each button calls `POST /api/missions/:missionId/dispatch` with `triggerMessageId`, `targetAgent`, `intent`. If `suggestions.length === 0`, the component returns `null` (no card). |
| **List** | `AgentChatView.tsx` (lines 871–882) | The chat list is `resolvedRows` (filtered + deduped for `run_lifecycle`). Each row is rendered with `MessageRenderer`; `displayMessage` is `rowToDisplayMessage(row)`. So **every message returned by the API is rendered**; the type of each message decides whether it’s a bubble, PlanCard, ResearchCard, or **ExecutionSuggestionsCard**. |

So the card appears **only when there is a message** with `messageType === 'execution_suggestions'` and `payload.suggestions` (array with at least one item). That message is a **separate** row in the message list (created after the Planner’s text and plan_update).

---

## 2. Where the `execution_suggestions` message comes from

| Step | Location | Behavior |
|------|----------|----------|
| **Planner reply** | `apps/core/cardbey-core/src/agents/plannerAgent.ts` | After posting the main text reply, the code calls `parseNextStepsFromReply(reply)` to find a “Next Steps” section and a numbered/bullet list (max 5 steps). |
| **plan_update** | Same file (lines 154–172) | If `nextStepLabels.length > 0`, it calls `createAgentMessage({ messageType: 'plan_update', payload: { title: 'Next Steps', steps }, ... })`. |
| **execution_suggestions** | `apps/core/cardbey-core/src/orchestrator/lib/agentMessage.js` (lines 71–101) | Inside `createAgentMessage`, when `messageType === 'plan_update'` and `payload.steps` is a non‑empty array, it calls `inferExecutionSuggestions(payload)`. If that returns at least one suggestion, it creates a **second** message with `messageType: 'execution_suggestions'` and `payload: { suggestions }`, then saves the chain plan. |

So the Run/Skip card appears only if:

1. The Planner’s reply is parsed and yields at least one step (`parseNextStepsFromReply`).
2. The `plan_update` message is created successfully.
3. `inferExecutionSuggestions` returns at least one suggestion (keyword-based or fallback `follow_up`).
4. The follow-up `createAgentMessage(..., 'execution_suggestions', ...)` succeeds.

---

## 3. Why the card might not show

### A. Parsing: no “Next Steps” section detected

**Parser:** `plannerAgent.ts` → `parseNextStepsFromReply(reply)`.

- It looks for a **heading** that is exactly one of (case‑insensitive):
  - `### Next Steps` (with optional trailing spaces, no colon)
  - `**Next Steps**`
  - `Next Steps` (whole line)
- It does **not** currently match:
  - `Next steps:` (with colon)
  - `**Next steps:**`
  - `### Next steps:` or similar with a colon at the end

If the model outputs “Next steps:” or “Next Steps:”, `inSection` never becomes true and no steps are collected, so no `plan_update` or `execution_suggestions` is created.

**Fix (recommended):** Extend the heading regex to allow an optional colon, e.g. `Next\s+Steps\s*:?\s*$`, so “Next Steps” and “Next steps:” both start the section.

### B. Parsing: list format

- Steps must appear as lines that match: `1. ...`, `2) ...`, or `- ...` / `* ...` (with content after).
- Blank lines or non-matching lines after the first step can cause the loop to `break` (see “else if (t.length > 0 && steps.length > 0) break”). So odd formatting can stop step collection early.

### C. Backend: plan_update or execution_suggestions creation fails

- Any error in `createAgentMessage` (DB, broadcast, etc.) is caught in `plannerAgent.ts` (lines 169–170) and only logged; the UI gets no second message.
- The same applies to the inner `createAgentMessage(..., 'execution_suggestions', ...)` in `agentMessage.js` (catch around 98–99): failure is only warned, so the card never appears.

Checking server logs for `[plannerAgent] Failed to post plan_update` or `[createAgentMessage] execution_suggestions follow-up failed` will confirm this.

### D. Agent filter in the UI

- **AgentChatView** filters rows by `agentFilter` (e.g. “Research” only). The `execution_suggestions` message has `senderId: 'planner'` and `senderType: 'system'`, so it is treated as planner.
- If the user selects **“Research” only**, that row is filtered out and the card is not shown. With **“All”** or **“Planner”**, the row is included and the card can show.

### E. Payload shape

- **MessageRenderer** expects `payload` to be an object and passes it to `ExecutionSuggestionsCard`.
- **ExecutionSuggestionsCard** uses `payload.suggestions`; if it’s missing or empty, the component returns `null`, so the message row still appears but with no visible card (only timestamp/layout). Ensuring the backend always sends `payload: { suggestions: [...] }` with at least one item avoids this.

---

## 4. Data flow summary

```
Planner LLM reply (text)
  → parseNextStepsFromReply(reply)  → [ "Prepare marketing assets...", ... ]
  → createAgentMessage(plan_update, { title, steps })
       → DB: plan_update message
       → inferExecutionSuggestions(payload) → [ { label, agentKey, intent }, ... ]
       → createAgentMessage(execution_suggestions, { suggestions })
            → DB: execution_suggestions message
            → saveChainPlan(...)
  → GET /agent-messages returns both messages
  → For execution_suggestions row, MessageRenderer renders ExecutionSuggestionsCard
  → Card shows “Suggested actions” + Run buttons (or null if suggestions.length === 0)
```

---

## 5. Quick checks when the card doesn’t show

1. **Server log:** Look for `[plannerAgent] Failed to post plan_update` or `execution_suggestions follow-up failed`.
2. **Reply format:** Ensure the Planner output has a heading like `### Next Steps` (or add support for `Next steps:`) and a clear `1. ...` / `2. ...` list.
3. **UI filter:** Set the agent filter to “All” or “Planner” so the execution_suggestions message isn’t hidden.
4. **API response:** In devtools, inspect `GET /api/agent-messages?missionId=...` and confirm there is a message with `messageType: 'execution_suggestions'` and `payload.suggestions.length > 0`.

Implementing the optional colon in the “Next Steps” heading pattern is the smallest change that can fix the most common “card not showing” case when the model uses “Next steps:” instead of “Next Steps”.
