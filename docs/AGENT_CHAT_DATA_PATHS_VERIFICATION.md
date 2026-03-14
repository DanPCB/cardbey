# Agent Chat Data Paths – Verification

## Summary

For the **Agent Chat** feature (`/app/back/missions/:missionId/chat`), there are **two** backend data paths. Both are now permissioned: agent-messages and the agent-chat stream (via short-lived stream token).

There is **no** `/api/missions/:id` in the codebase. Mission id comes from the route param only; no separate "load mission" API is used by the Agent Chat UI.

---

## 1. Chat messages (stricter permission)

- **Endpoint:** `GET /api/agent-messages?missionId=...` (and `POST /api/agent-messages` for sending)
- **Auth:** `requireAuth` (JWT or dev token)
- **Permission:** When `missionId` is an `OrchestratorTask.id`, access is restricted to:
  - task owner: `task.userId === req.user.id` or `task.tenantId === req.user.id`
  - same tenant: `task.userId === req.user.business?.id` or `task.tenantId === req.user.business?.id`
  - dev bypass (non-production only): task created with `userId` or `tenantId` in `['temp', 'dev-user-id']` → any authenticated user can access
- **Implementation:** `apps/core/cardbey-core/src/routes/agentMessagesRoutes.js`

---

## 2. SSE stream (now permissioned for agent-chat)

- **Endpoint:** `GET /api/stream?key=agent-chat&missionId=...&streamToken=...`
- **Auth for agent-chat:** When `key=agent-chat` and `missionId` are present, a valid **streamToken** is required. The token is a short-lived JWT (5 min) issued by `POST /api/agent-messages/stream-token` (which uses the same ownership check as GET agent-messages). Without a valid token, the server returns **403** and does not open the stream.
- **Other keys:** When `key` is not `agent-chat` (e.g. `key=admin`), no streamToken is required (unchanged behaviour for existing SSE consumers).
- **Implementation:** `apps/core/cardbey-core/src/realtime/sse.js` uses `verifyAgentChatStreamToken` middleware before `handleSse`; token issuance in `apps/core/cardbey-core/src/routes/agentMessagesRoutes.js` and verification in `apps/core/cardbey-core/src/lib/agentChatStreamAuth.js`. Dashboard fetches a stream token via `apiPOST('/agent-messages/stream-token', { missionId })` and appends it to the stream URL.

---

## 3. Other “mission” / task endpoints (not used by Agent Chat)

- **GET /api/orchestrator/insights/task/:taskId** – Task status/result. Uses `requireAuth` and restricts by `tenantId` (`where: { id: taskId, tenantId }` with `tenantId = req.userId || req.user?.tenantId`). Not used by `AgentChatView.tsx`.
- **No `/api/missions/:id`** – No such route exists. The dashboard gets `missionId` from the URL (`missions/:missionId/chat`) and does not call a separate API to load “mission” metadata for the chat page.

---

## 4. Dashboard usage (Agent Chat only)

- **AgentChatView.tsx** only:
  - Fetches messages: `GET /api/agent-messages?missionId=${missionId}` (uses auth via `apiGET`).
  - Fetches stream token: `POST /api/agent-messages/stream-token` with `{ missionId }` (same auth as messages).
  - Subscribes to stream: `EventSource(buildStreamUrl('key=agent-chat&missionId=...&streamToken=...'))`.
  - Sends messages: `POST /api/agent-messages` (body: `missionId`, `text`, `channel`).

---

## Conclusion (updated after stream fix)

- **GET/POST `/api/agent-messages`** and **GET `/api/stream`** (when `key=agent-chat` and `missionId` are set) now share the same permission model: task ownership / tenant / dev bypass. The stream requires a short-lived **streamToken** issued by `POST /api/agent-messages/stream-token`, which uses the same `canAccessMission` logic.
- **Other stream keys** (e.g. `key=admin`) are unchanged and do not require a streamToken.
- There is no separate “initial mission data” API like `/api/missions/:id` for the Agent Chat; mission id comes from the route and permission is enforced on both messages and stream.
