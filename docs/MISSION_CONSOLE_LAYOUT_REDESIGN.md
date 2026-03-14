# Mission Console Layout Redesign — 3-Zone Workspace + Mobile Chat Sheet

**Goal:** Transform Mission Console into a continuous AI operator workspace with persistent MI Chat at the **workspace** level (Sidebar | Mission Workspace | MI Chat). Chat owned by layout, not by execution. Mobile: bottom sliding chat sheet.

---

## Risk assessment (before coding)

### Could this break mission execution flow?

- **Risk: Low.** Execution is triggered from `MissionDetailView` (Confirm & Run) → `ConsoleContext.startExecution(missionId)` → `ExecutionDrawer` opens. We are only changing **where** the chat panel is rendered (from inside `MissionDetailView` to `ConsoleShell`). Execution flow does not depend on chat placement. No changes to `ConsoleContext`, `ExecutionDrawer`, or run triggers.

### Could this break report rendering?

- **Risk: Low.** Report lives in `ExecutionDrawer`. Layout change: content area becomes `main | MissionChatPanel | ExecutionDrawer` when `missionId` is set. Drawer remains a sibling; we are inserting the chat panel **between** main and drawer. Order will be: Center (mission content) → MI Chat (right panel) → Execution Drawer (when open). Both chat and drawer can be visible. No change to drawer content or open/close logic.

### Could this break preview navigation?

- **Risk: None.** "Open Draft Review" navigates to `/app/store/:storeId/review` (different route). We are not changing that link or route. When the user returns to `/app/missions/:missionId`, chat remounts and loads messages from the backend. Session is not "destroyed"—backend stores messages by `missionId`.

### Could this break mobile responsiveness?

- **Risk: Medium (mitigated).** Adding a fixed-width right panel (320px+) on small screens would compress the mission workspace or cause horizontal scroll. **Mitigation:** On viewports below a breakpoint (e.g. 768px), we do **not** render the side panel; we render a **floating chat button** and a **bottom sliding sheet** that contains the same `AgentChatView`. So on mobile, chat is accessible without taking permanent horizontal space. We will implement the sheet with a simple slide-up panel and swipe-down-to-close (or button). If the sheet has z-index or focus issues, we may need to revisit; testing required.

### Summary

- **Proceed with implementation.** Risks are low; mobile is mitigated by the bottom-sheet pattern. If we see regressions (e.g. drawer overlapping chat in a bad way, or sheet not closing), we can adjust in follow-up.

---

## Target layout

### Desktop (3-zone)

```
| Sidebar | Mission Workspace          | MI Chat         |
|         |                             |                 |
|         | Plan / Progress             | Conversation    |
|         | Artifacts / Reports         | Suggestions     |
|         | Review / Actions            | Follow-ups      |
```

- **Left:** Existing `ConsoleSidebar` (unchanged).
- **Center:** Mission workspace = `Outlet` (MissionDetailView when on `/app/missions/:missionId`). Contains mission summary, plan, execution pipeline, artifacts, reports. Single column again (chat no longer inside MissionDetailView).
- **Right:** `MissionChatPanel(missionId)` — persistent, resizable (min 320px), collapsible to 48px icon dock. Rendered by **ConsoleShell** when `missionId` is in the URL.

### Mobile

- Right panel **not** shown. Instead:
  - Floating chat button (bottom right).
  - Tap → bottom sliding sheet with MI Chat.
  - Swipe down or close button → collapse sheet.

---

## Component refactor plan

1. **ConsoleShell**
   - Read `missionId` from `useParams()`.
   - When `missionId` is set, render content area as: `main (Outlet) | MissionChatPanel(missionId) | ExecutionDrawer`. So chat is a **sibling** of main and drawer, owned by the shell. Chat state is not tied to execution; it is always present when on a mission route.

2. **MissionDetailView**
   - **Revert** to single-column layout. Remove `MissionChatPanel` and the two-pane flex. Only render mission content (user prompt + PlanProposalBlock). Chat is no longer inside this component.

3. **MissionChatPanel**
   - Keep as wrapper around `AgentChatView` with header and collapse/expand.
   - **Responsive:** Use a breakpoint (e.g. 768px). Above: render as side panel (current behavior). Below: render **only** a floating button; when open, render a **bottom sheet** (fixed bottom, full width, max height ~70vh) containing `AgentChatView`. Sheet state: `open`/`closed`, toggled by button and optionally by swipe-down.

4. **MissionWorkspaceProvider (optional)**
   - For future context injection (mission intent, artifacts, warnings) into the chat session, we can add a provider that holds `missionId` and mission snapshot. Not required for this deliverable; chat already receives `missionId` and fetches messages. Can be added later.

---

## Deliverables

1. **Repo audit** — See existing `MISSION_CONSOLE_PERSISTENT_CHAT_AUDIT_AND_PLAN.md`; chat was inside MissionDetailView, now moves to shell.
2. **Layout plan** — This doc (desktop 3-zone, mobile bottom sheet).
3. **Component refactor** — Above.
4. **Implementation** — Code changes below.
5. **Acceptance criteria** — Listed at end of this doc.

---

## Acceptance criteria

- [ ] Mission chat is visible during execution (right panel on desktop).
- [ ] Mission chat remains accessible after completion (same panel, no reset).
- [ ] User can ask follow-up questions after mission completes without leaving the workspace.
- [ ] Opening "View report" (Execution drawer) does not hide or destroy the chat; both can be visible.
- [ ] Opening preview (Draft Review) in another tab/window does not affect chat; returning to mission page shows chat with same conversation.
- [ ] Mobile: floating chat button visible; tap opens bottom sheet; sheet shows MI Chat; overlay or close button closes sheet.
- [ ] Mission console feels like an AI workspace (conversation always available), not a one-shot job runner.
- [ ] Chat panel is collapsible (desktop) to 48px icon dock; expand restores panel.

---

## Implementation summary (done)

| File | Change |
|------|--------|
| `docs/MISSION_CONSOLE_LAYOUT_REDESIGN.md` | Risk assessment, 3-zone layout plan, mobile behavior, acceptance criteria. |
| `ConsoleShell.tsx` | When `missionId` in URL, render `MissionChatPanel(missionId)` between main and `ExecutionDrawer`. 3-zone: Sidebar \| Mission Workspace (Outlet) \| MI Chat \| Execution Drawer. |
| `MissionDetailView.tsx` | Reverted to single column (user + PlanProposalBlock only). Chat no longer inside this view; owned by shell. |
| `MissionChatPanel.tsx` | Desktop: side panel (min 320px, collapsible to 48px). Mobile: `useIsMobile()` at 768px; render floating FAB + bottom sheet (max-height 70vh); tap FAB opens sheet, overlay or X closes. Panel state owned by layout. |

No changes to execution flow, report rendering, or preview navigation. Mobile uses a zero-width wrapper so the panel takes no flex space when in FAB/sheet mode.
