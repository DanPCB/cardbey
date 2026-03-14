# Agent Conversations (Beta) v0 – Verification Checklist

Use this checklist to verify the thread registry + participants + thread chat view flow. Agent-messages remain the single message store (missionId-based); thread is a container for participants + discovery bound to missionId. SSE stays missionId-based with existing stream-token auth.

---

## 1. Create thread → navigate → send message → refresh persists

- [ ] Go to **Agent Conversations (Beta)** (sidebar) → `/app/back/threads`.
- [ ] Click **New conversation**; optionally set title and agents (planner, research); submit.
- [ ] App navigates to `/app/back/threads/:threadId`.
- [ ] Send a message in the composer; ensure it sends and agent replies appear (planner/research).
- [ ] Refresh the page (F5 or reload).
- [ ] Same thread loads; message history is still there (no data loss).

---

## 2. Open in second tab → SSE updates

- [ ] With a thread open and chat visible, open the **same** thread in a second browser tab (same URL).
- [ ] In the first tab, send a new message and get agent replies.
- [ ] In the second tab, new messages appear **without** manual refresh (SSE live updates).

---

## 3. Forbidden access → shows forbidden message

- [ ] As User A, create a thread and note the `threadId` (or copy URL).
- [ ] As User B (different account, or in another tenant if multi-tenant), open that thread URL directly (e.g. `/app/back/threads/:threadId`).
- [ ] UI shows an explicit **Forbidden** message: “You don’t have access to this conversation” (not a generic “Thread not found” or blank).
- [ ] A “Back to list” (or equivalent) link is present and returns to `/app/back/threads`.

---

## 4. Agent rail shows planner + research immediately

- [ ] Open a **new** thread (no messages yet).
- [ ] Agent rail (or mobile dropdown) shows **Planner** and **Research** (and any other agents selected at creation) immediately, even with zero messages.
- [ ] “Send to” dropdown in composer includes those agents (e.g. Auto, Planner Agent, Research Agent).

---

## 5. SSE stream-token security (no regression)

- [ ] Agent Chat (via thread or legacy mission route) still uses the same SSE flow: key=agent-chat, missionId=….
- [ ] Stream token is short-lived and mission-scoped; no change to how stream-token is issued or validated.
- [ ] Unauthenticated or wrong-mission access to SSE still returns 401/403 as before; no new bypass.

---

## 6. Bind to existing mission (New conversation modal)

- [ ] **Create thread (new mission) works**: New conversation → leave “Create new mission” selected → Create. Thread is created with a new missionId; chat loads and sending works.
- [ ] **Bind thread to existing mission works**: Create a thread (new mission), send a few messages, note the thread. Open New conversation → select “Bind to existing mission” → search or pick a mission from the list (or paste mission ID) → Create. New thread opens; chat shows **existing messages** for that mission; sending adds to the same mission.
- [ ] **Binding to mission you can’t access is blocked**: As User A, note a missionId from a thread you own. As User B (different account), New conversation → Bind → paste User A’s missionId → Create. Server returns 403; UI shows toast “You don’t have access to that mission.” (and/or modal error). No thread is created.
- [ ] **SSE stream-token still works with bound missionId**: Open a thread that is bound to an existing mission; send a message. SSE live updates still work; stream-token remains missionId-based with no regression.

---

## Sign-off

- [ ] All items above checked.
- [ ] No layout regressions: full-width chat background, centered message column, composer pinned, no dark strip.
- [ ] Mobile: agent rail collapsible or dropdown; no broken layout on small screens.
