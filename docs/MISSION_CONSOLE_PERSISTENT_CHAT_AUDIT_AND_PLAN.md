# Mission Console → Persistent Interactive Agent Workspace

**Goal:** Upgrade Mission Console from a single-run execution screen to a persistent interactive agent workspace so the MI conversation remains visible and accessible across the mission lifecycle (before run, during execution, after completion, follow-up).

---

## 1. Repo audit summary

### Where mission chat currently lives

- **Route:** `/app/threads/:threadId` → `ThreadChatView` (in `src/pages/agent-chat/ThreadChatView.tsx`).
- **Component:** `ThreadChatView` loads a thread via `GET /api/threads/:threadId`, reads `thread.missionId`, then renders `AgentChatView` with that `missionId`.
- **AgentChatView** (same folder) is the actual conversation UI: fetches messages by `missionId` (`GET /agent-messages?missionId=...`), subscribes to SSE, sends via POST. It only needs `missionId` (and optional `initialAgentKeys`); it does **not** require a thread ID to function.
- **Mission UI:** `/app/missions/:missionId` → `MissionDetailView` (in `src/app/console/missions/MissionDetailView.tsx`). Renders user prompt + `PlanProposalBlock` (plan, Confirm & Run / View report / Start new mission). **No chat component is mounted here.**

### Why chat disappears / feels terminated

- Chat is **not mounted on the mission route**. It lives on a **separate route** (`/app/threads/:threadId`). When the user is on `/app/missions/:missionId`, only `MissionDetailView` is rendered in the `<Outlet />`; when they go to chat they navigate away to `/app/threads/:threadId`.
- So the conversation does not “unmount on completion”—it was **never present** on the mission page. The mission page has no conversation entry point; the only way to chat is to leave the mission and open a thread (and ThreadChatView’s “Back” goes to `/app/back/threads`, not back to the mission).
- **Component/state boundary:** Under `/app`, `ConsoleShell` renders a single `<Outlet />`. The outlet shows one of: `ConsoleHomeWorkspace`, `MissionLogsListView`, `MissionDetailView`, or `ThreadChatView`. Only one is visible at a time. So mission workspace and chat are **sibling routes**, not a unified workspace.

### Root cause

- **Chat is owned by a different route**, not by the mission workspace. The mission workspace (`MissionDetailView`) never mounts `AgentChatView`, so completion feels like a dead-end (View report / Start new mission only) with no ongoing conversation.

---

## 2. Implementation plan

### Component ownership changes

- **Own chat at the mission workspace level:** When the user is on `/app/missions/:missionId`, the screen will show **both** mission content (user prompt, plan, report actions) **and** the mission chat in one layout.
- **MissionDetailView** will be refactored to a two-pane layout when `missionId` is present:
  - **Left pane:** Current content (user prompt, PlanProposalBlock). Scrollable, unchanged behavior.
  - **Right pane:** Persistent **Mission Chat** panel rendering `AgentChatView` with the current `missionId`. Always visible (desktop); on narrow viewports, collapsible so the user can expand “Chat” when needed.
- No new route. The existing route `missions/:missionId` → `MissionDetailView` stays; only the content of `MissionDetailView` gains the chat pane.
- **ExecutionDrawer** remains unchanged: it stays the execution/report/artifacts panel. Chat is not moved into the drawer; it is a **separate, persistent** column so conversation is always visible and not hidden behind a tab.

### Route / layout

- **No route or layout changes** in `App.jsx` or `ConsoleShell`. `ConsoleShell` continues to render `<Outlet />`; when the outlet is `MissionDetailView`, that view will now render the split layout (mission content + chat) internally.
- Navigation between `/app`, `/app/missions`, and `/app/missions/:missionId` is unchanged. When leaving `/app/missions/:missionId`, the chat unmounts with the view (expected); when returning to the same mission, chat mounts again and loads messages for that `missionId` from the backend.

### Conversation state persistence

- **Backend-owned:** Messages are already stored and fetched by `missionId` via `/agent-messages?missionId=...`. No new persistence layer.
- **No localStorage for chat:** We do not persist “open/closed” chat state across missions; when the user opens a mission, the chat panel is visible (or restorable via a toggle). Panel open/closed state can be stored in React state and optionally in `sessionStorage` or a simple localStorage key for “chat panel collapsed” so it survives refresh on the same mission.

### Desktop / mobile behavior

- **Desktop:** Two columns: left = mission content (flex: 1, min-width 0), right = Mission Chat panel (e.g. min-width 320px, max-width 420px). Resizable or fixed; if space is tight, right panel can collapse to a strip with “Chat” button that expands.
- **Mobile / narrow:** Single column by default (mission content full width). A floating “Chat” button or a “Chat” tab in the mission view expands the chat as a bottom sheet or full-width panel so the user can still access conversation without leaving the mission.

---

## 3. Code changes (summary)

1. **MissionDetailView.tsx**
   - Import `AgentChatView` (or a thin wrapper `MissionChatPanel`).
   - When `missionId` is set, render a flex container: left = existing scrollable content (user + PlanProposalBlock), right = `MissionChatPanel` (or `AgentChatView`) with `missionId`.
   - Add a collapsible toggle for the right panel (and optional persistence of “collapsed” in sessionStorage) so narrow screens can default to mission-only and expand chat on demand.

2. **MissionChatPanel (new, optional)**
   - Thin wrapper around `AgentChatView` that adds a small header (“MI Chat” / “Conversation”) and a collapse/expand control. Renders `AgentChatView({ missionId })`.

3. **PlanProposalBlock.tsx**
   - When `executionStatus === 'completed'`, add a short line that reframes completion as “conversation continues,” e.g. “Use the chat to refine results, ask for improvements, or start a follow-up.” Keep “View report” and “Start new mission” but avoid making “Start new mission” the only way to continue.

4. **No changes** to ExecutionDrawer, ConsoleShell, App.jsx routes, or ThreadChatView. ThreadChatView remains for direct navigation to a thread by ID when needed.

---

## 4. Acceptance criteria

- User can open a mission (`/app/missions/:missionId`) and **always** see an accessible MI chat panel (persistent right pane or expandable panel).
- After the mission reaches **completed**, the **same** conversation panel remains visible and usable; it does not disappear or reset.
- User can continue chatting about the completed mission (e.g. “improve the hero,” “fix product names,” “help me publish”) without starting a new mission or being forced back to the launcher.
- Mission report / review flow (View report → Execution drawer) does not feel like a dead-end: chat remains available on the mission page alongside “View report” and “Start new mission.”
- Architecture supports future grow-process flows (improve store, publish, launch promotion, etc.) using the same chat surface on the mission page.

---

## 5. Manual verification checklist

- [ ] Open a mission (draft or running). Mission Chat panel is visible on the right (desktop); collapse/expand works.
- [ ] Complete the mission (or open an already completed mission). Chat panel is still visible and usable.
- [ ] Send a message in the chat after completion. Message is sent and appears in the conversation.
- [ ] Click “View report.” Execution drawer opens; chat panel remains visible on the mission page.
- [ ] Completed state shows: “Use the chat to refine results, ask for improvements, or start a follow-up.” Chat is clearly the primary way to continue.
- [ ] “Start new mission” remains available but is not the only CTA; conversation is primary.
- [ ] Collapse the chat panel (chevron); expand again. State persists (localStorage).
- [ ] Navigate away to Mission Logs or Home, then back to the same mission. Chat loads again with the same mission’s conversation.

---

## 6. Files changed (implementation)

| File | Change |
|------|--------|
| `docs/MISSION_CONSOLE_PERSISTENT_CHAT_AUDIT_AND_PLAN.md` | Audit, plan, acceptance criteria, checklist. |
| `src/app/console/missions/MissionChatPanel.tsx` | **New.** Wraps `AgentChatView` with “MI Chat” header and collapse/expand; persists collapsed in localStorage. |
| `src/app/console/missions/MissionDetailView.tsx` | Two-pane layout: left = mission content (user + PlanProposalBlock), right = `MissionChatPanel(missionId)`. Chat always mounted when on mission. |
| `src/app/console/missions/PlanProposalBlock.tsx` | When completed, add line: “Use the chat to refine results, ask for improvements, or start a follow-up.” |
