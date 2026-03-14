# Agent Chat UI v0.5 – Manual Verification Checklist

Use this checklist after deploying the multi-agent two-pane redesign. No auth/SSE logic changes; UI and parsing only.

---

## Desktop (≥ md breakpoint)

- [ ] **Layout**
  - [ ] Two columns visible: **Agent Rail** (left, ~300px) and **Conversation** (right).
  - [ ] Rail shows "Agents" header, mission id truncation, "Add" (disabled), and "All" / "Active" (Active disabled).
  - [ ] Conversation has header (Agent Chat, mission id), then message area, then composer at bottom.

- [ ] **Agent Rail**
  - [ ] Planner Agent and Research Agent rows appear (initials PA, RA).
  - [ ] Each row shows name, state label, last activity time.
  - [ ] Clicking a row sets agent filter (row highlighted); clicking again or "All" clears filter.
  - [ ] "All" / "Active" toggle: "All" selected by default; "Active" is disabled.

- [ ] **Header (conversation)**
  - [ ] "Agent Chat" and full mission id (e.g. monospace).
  - [ ] Live/Offline indicator (green when SSE connected, muted when not).
  - [ ] "All agents" dropdown: options "All agents", "Planner Agent", "Research Agent"; changing filters the message list.

- [ ] **Message list**
  - [ ] Messages in a **centered column** (max-width 3xl).
  - [ ] User messages: **right-aligned**, primary-colored bubble.
  - [ ] Agent messages: **left-aligned**, with avatar (initials), agent name, and role badge (Planner = blue, Research = emerald).
  - [ ] Timestamps below each bubble; Research citations shown when present.
  - [ ] No "Planning: …" message as a bubble (status only in rail if such a message exists from backend).

- [ ] **Composer**
  - [ ] "Send to" selector: Auto (Planner), Planner Agent, Research Agent.
  - [ ] Textarea accepts multi-line; Shift+Enter adds new line.
  - [ ] Enter (without Shift) sends message when draft non-empty.
  - [ ] Send button disabled when draft empty or sending.
  - [ ] Helper text visible: "Shift+Enter for new line…".

- [ ] **Behaviour**
  - [ ] Sending a message: POST succeeds, message appears, refetch/SSE brings in Planner/Research replies.
  - [ ] Selecting "Research Agent" in Send to and sending: message is sent (channel research); flow unchanged otherwise.
  - [ ] Filter by agent: "Planner Agent" shows only planner + user messages; "Research Agent" shows only research + user messages; "All agents" shows everything.

---

## Mobile (< md breakpoint)

- [ ] **Layout**
  - [ ] **Agent Rail is hidden**; only the conversation section is visible (full width).
  - [ ] No horizontal scroll or layout overflow.

- [ ] **Header**
  - [ ] Same title and mission id; Live/Offline and **dropdown** for agent filter (replaces rail for filtering).
  - [ ] Dropdown works: All agents / Planner Agent / Research Agent filter the list correctly.

- [ ] **Message list**
  - [ ] Centered column, same bubble alignment (user right, agent left).
  - [ ] Readable and scrollable; no clipping of bubbles.

- [ ] **Composer**
  - [ ] Send to selector, textarea, and Send button stack or wrap sensibly; all usable.
  - [ ] Keyboard (e.g. on-screen) doesn’t obscure composer.

---

## Regression (both viewports)

- [ ] **Auth / SSE**
  - [ ] Loading messages requires login (no change to auth).
  - [ ] SSE: new agent messages appear without refresh when "Live" is shown.
  - [ ] After send, planner/research replies appear (SSE or refetch fallback).

- [ ] **Navigation / AppShell**
  - [ ] Back / sidebar navigation unchanged.
  - [ ] Route `/missions/:missionId/chat` still loads Agent Chat; no blank or broken layout in BackOffice.

---

## Sign-off

- **Desktop:** _________________  Date: _______
- **Mobile:**  _________________  Date: _______
