# Agent Chat (Test) – Code Audit Report

**Scope:** The "Agent Chat (Test)" section (`/app/back/agent-chat-test`, missionId `test-mission-agent-chat`).  
**Goal:** Identify why it was not functioning correctly (e.g. "Debug: Unknown messageType: system", chat feeling stuck).

---

## 1. Problem Observed

- **UI:** After sending "write a test marketing plan", the user saw:
  - "✔ Planner • Completed" lines (run lifecycle) with timestamps.
  - **"Debug: Unknown messageType: system."** appearing in orange-brown under those lines.
- **Effect:** Chat looked broken or "stuck" because system messages were not rendered as readable content.

---

## 2. Root Cause

### 2.1 Where "Unknown messageType: system" Comes From

- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/agent-chat/MessageRenderer.tsx`
- **Logic:** The renderer switches on `row.messageType`:
  - **Handled explicitly:** `run_lifecycle` (only when `row.senderType === 'system'` and `payload.kind === 'run_lifecycle'`) → `RunLifecycleTimelineItem` (e.g. "✔ Planner • Completed").
  - **Handled in switch:** `text`, `research_result`, `plan_update`, `campaign_proposal`, `checkpoint_form`, `approval_required`, `artifact`, `execution_suggestions`, `review_result`.
  - **Not handled:** `messageType === 'system'` when the payload is **not** `run_lifecycle` (e.g. `task_completed` or generic system notices).
- **Result:** Those system messages hit the `default` branch and were rendered as:  
  `fallbackToBubble('Unknown messageType: system')`, which shows the debug line: **"Debug: Unknown messageType: system."**

### 2.2 Why There Are System Messages With type `system` But Not run_lifecycle

- **Backend:** `apps/core/cardbey-core/src/lib/agentRunExecutor.js` uses `postSystemMessage(missionId, agentKey, text, payload)`.
  - Run lifecycle (e.g. "Run completed: planner") is sent with `payload = { kind: 'run_lifecycle', runId, agentKey, status }` → **handled** by the UI.
  - Task completion (e.g. "Task completed: Update your website...") is sent with `payload = { kind: 'task_completed', ... }` → **same** `messageType: 'system'` but **different** `payload.kind`.
- The UI only treated `payload.kind === 'run_lifecycle'` as special; all other system messages (including `task_completed`) fell through to the default case → "Unknown messageType: system".

---

## 3. Data Flow (No Issues Found)

- **Route:** `/app/back/agent-chat-test` → `AgentChatTestPage` → `<AgentChatView missionId="test-mission-agent-chat" />`.
- **Messages:** Fetched via `apiGET('/agent-messages?missionId=...')`; sent via POST to agent-messages; SSE used for live updates.
- **Backend:** test-mission-agent-chat is configured as text-only (OCR skipped/graceful); planner runs and system/task messages are created as above. No additional routing or API bugs were found for this page.

---

## 4. Fix Applied

- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/agent-chat/MessageRenderer.tsx`
- **Change:** Added an explicit **`case 'system':`** in the message-type switch.
  - For any message with `messageType === 'system'` that is **not** already handled as `run_lifecycle` (handled earlier in the component), the renderer now shows a small, muted, timeline-style line with the message text and timestamp.
  - This covers `task_completed` and any other system notices so they no longer hit the default and no longer show "Debug: Unknown messageType: system."

---

## 5. Summary

| Item | Finding |
|------|--------|
| **Symptom** | "Debug: Unknown messageType: system" under Planner • Completed lines. |
| **Cause** | MessageRenderer had no branch for `messageType === 'system'` when `payload.kind !== 'run_lifecycle'`. |
| **Fix** | Handle `case 'system'` by rendering the system message text (and time) as a muted timeline line. |
| **Scope** | Only the dashboard message renderer; backend and mission/OCR behavior unchanged. |

After this change, Agent Chat (Test) should show all system messages (including task completions) as readable timeline lines instead of the debug warning.
