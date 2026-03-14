# Integration Diffs — Board Room External Participants (NO implementation yet)

**Date:** 2026-03-03  
**Follows:** `docs/AUDIT_MULTI_AI_GROUP_CHAT_ROOM.md`  
**Locked rule:** No change may touch DraftStore, orchestra/start, or shared auth paths (requireAuth/optionalAuth contract). If a change would touch them, **warn and do not propose**.

---

## ⚠️ Risk warning (locked rule)

- **Do NOT modify:** `apps/core/cardbey-core/src/routes/draftStore.js`, `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js`, `apps/core/cardbey-core/src/routes/miRoutes.js` (handleOrchestraStart), or any shared auth middleware in `middleware/auth.js`.
- **Do NOT add** dependencies from thread/chat routes to DraftStore or orchestra services.
- **Allowed:** New routes under `/api/chat/threads`, extensions to `ChatThreadParticipant`, new service files under `services/externalChat/` (or similar), and reuse of **existing** `ensureThreadParticipant` / `canAccessMission` only where they are already used for chat (no change to their signatures or behavior for other callers).

---

## 1) Decision: canonical thread model for “board room”

**Choice: ChatThread (and ChatThreadParticipant) as canonical.**

**Reasons:**

| Criterion | ChatThread | ConversationThread |
|-----------|------------|--------------------|
| **Message binding** | `AgentMessage.threadId` → ChatThread; messages are **thread-scoped** by threadId. | Messages are **mission-scoped** (AgentMessage.missionId); thread is a view over a mission. No AgentMessage.threadId on ConversationThread. |
| **Existing API** | `/api/chat/threads`, `/api/chat/threads/:id/messages`, `/api/chat/threads/:id/stream` already use ChatThread + ensureThreadParticipant. | `/api/threads` uses ConversationThread + canAccessThread + canAccessMission; messages fetched by missionId, not by thread. |
| **Add participant / Ask X** | One place: extend ChatThreadParticipant and add POST participants + POST ask-external on **same** router (`chatThreadsRoutes.js`) and same access pattern (ensureThreadParticipant). | Would require either (a) adding message-by-thread to ConversationThread (new relation or query by thread) or (b) two thread systems (ConversationThread for list, ChatThread for messages) and confusion. |
| **Board room semantics** | “This room has these participants; messages in this room” maps to ChatThread + participants + AgentMessage.threadId. | “This thread is a view on a mission” is better for mission-centric flows (e.g. campaign planner), not for “add ChatGPT and ask it here.” |

**Conclusion:** Use **ChatThread** as the single canonical “board room” model. Add external participants and “Ask X” to the **existing** `/api/chat/threads` surface so list/detail/messages/stream/participants/ask-external are all under one thread type. ConversationThread remains for mission-bound list views (e.g. `/api/threads`) and is **not** extended for external providers in this plan.

---

## 1.1) Critical nuance: missionId vs threadId for board-room messages

**Do not** use `thread.id` as a fallback for `missionId`. Mission-based auth and streaming assume `missionId` is a real **OrchestratorTask.id** or **Mission.id**. Writing a fake-looking `missionId` (e.g. a ChatThread id) can cause:

- **canAccessMission(missionId, user)** to fail (no task/mission exists).
- **SSE token issuance/validation** to break (tokens are mission-scoped).

**Safer pattern for board-room ChatThread messages:**

- **missionId:** Set only when the thread actually has one: `missionId: thread.missionId ?? null`.
- **threadId:** Always set for board-room messages: `threadId: thread.id`.
- **createAgentMessage:** Must support **nullable missionId** when **threadId** is set (see prerequisite below). When `missionId` is null, the helper must not call mission-scoped broadcast or mission-scoped logic (plan_update, chain, reviewer).

**Prerequisite before implementing ask-external:**

1. **Schema:** Make **AgentMessage.missionId** optional: `missionId String?` in `prisma/sqlite/schema.prisma` and `prisma/postgres/schema.prisma`. Existing rows keep a value; new thread-only messages may have null.
2. **createAgentMessage** (`orchestrator/lib/agentMessage.js`): Allow `missionId` to be null/undefined when `threadId` is set. Validation: require `(missionId != null || threadId != null)`. When `missionId` is null: omit `broadcastAgentMessage(missionId, ...)`; call only `broadcastThreadMessage(threadId, ...)` when threadId is set; skip the entire `messageType === 'plan_update'` block (chain/reviewer/missionTasks are all mission-scoped). No changes to DraftStore or orchestra; no change to callers that always pass missionId (agent-messages, planner, research).

---

## 2) Prisma diff + migration plan

### 2.0 Prerequisite: AgentMessage.missionId optional (for thread-only messages)

**File:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma` (and postgres equivalent)  
**Model:** `AgentMessage`

**Change:** Make `missionId` optional so board-room messages can be thread-scoped only.

```prisma
// Before
missionId     String   // link to OrchestratorTask.id or a generic mission id

// After
missionId     String?  // link to OrchestratorTask.id or Mission id; null when message is thread-only (board room)
```

**Migration:** SQLite: `db push`. Postgres: add migration `ALTER TABLE "AgentMessage" ALTER COLUMN "missionId" DROP NOT NULL` (or equivalent). Existing rows keep missionId; new thread-only messages may have null. No change to DraftStore or orchestra (they do not create AgentMessages with null missionId).

### 2.1 Schema changes (ChatThreadParticipant only)

**File:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma`  
**Model:** `ChatThreadParticipant`

**Current:**

```prisma
model ChatThreadParticipant {
  id              String   @id @default(cuid())
  threadId        String
  participantType String   // 'user' | 'agent'
  participantId   String   // userId or agentId/role
  role            String   // 'owner' | 'member' | 'viewer'
  joinedAt        DateTime @default(now())

  thread ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId])
  @@index([threadId, participantType])
}
```

**Diff (add optional fields only; keep existing unique semantics):**

```prisma
model ChatThreadParticipant {
  id              String   @id @default(cuid())
  threadId        String
  participantType String   // 'user' | 'agent' | 'external_provider' | 'tool_bridge'
  participantId   String   // userId, agentKey, or providerKey (e.g. 'chatgpt', 'perplexity', 'cursor')
  role            String   // 'owner' | 'member' | 'viewer'
  joinedAt        DateTime @default(now())
  // ---- optional: for external_provider / tool_bridge ----
  displayName     String?  // e.g. "ChatGPT", "Perplexity", "Cursor"
  providerKey     String?  // canonical key: 'chatgpt' | 'perplexity' | 'cursor' (denormalized from participantId when type is external)
  capabilities    Json?    // e.g. ["reasoning","research","coding","media"] for UI "Ask X" and filters

  thread ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId])
  @@index([threadId, participantType])
  @@index([threadId, participantType, participantId])  // optional: for unique lookup if not already covered
}
```

**Notes:**

- **participantType:** Allow new values `external_provider` and `tool_bridge` in application code; no enum change in Prisma (keep as String).
- **participantId:** For external_provider, store e.g. `chatgpt`, `perplexity`, `cursor` so (threadId, participantType, participantId) remains unique (one ChatGPT per thread).
- **displayName:** Nullable; for user/agent can stay null (UI can fallback to participantId or a label map).
- **providerKey:** Nullable; duplicate of participantId when type = external_provider, for explicit querying and validation.
- **capabilities:** Json array of strings; no schema validation in DB.

**Postgres:** Apply the same diff to `apps/core/cardbey-core/prisma/postgres/schema.prisma` (same model block).

### 2.2 Migration plan

- **SQLite:** `npx prisma db push --schema prisma/sqlite/schema.prisma` (no migrate for SQLite per project note). Ensure no breaking change: new columns are nullable, no existing rows need updates.
- **Postgres (if used):** Add migration, e.g. `npx prisma migrate dev --name add_chat_thread_participant_external_fields --schema prisma/postgres/schema.prisma` with:

  ```sql
  ALTER TABLE "ChatThreadParticipant"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "providerKey" TEXT,
  ADD COLUMN "capabilities" JSONB;
  ```

- **Backfill:** None required; existing rows have new columns null.
- **Rollback:** Drop columns in a follow-up migration if needed; application must tolerate nulls.

---

## 3) Route handler skeletons (file paths + function signatures only)

All new handlers live in **`apps/core/cardbey-core/src/routes/chatThreadsRoutes.js`**. Reuse **`ensureThreadParticipant(threadId, userId)`** for auth; **do not** introduce new auth or touch DraftStore/orchestra.

### 3.0 Extend GET /api/chat/threads/:id (existing route)

- **File:** `chatThreadsRoutes.js` — existing `router.get('/threads/:id', ...)`.
- **Change:** After `ensureThreadParticipant`, load thread with participants: `prisma.chatThread.findUnique({ where: { id: threadId }, include: { participants: true } })`. Return in response `participants: thread.participants.map(p => ({ id: p.id, participantType: p.participantType, participantId: p.participantId, role: p.role, displayName: p.displayName ?? undefined, providerKey: p.providerKey ?? undefined, capabilities: p.capabilities ?? undefined, joinedAt: p.joinedAt }))`. No new route; one place to edit.

### 3.1 POST /api/chat/threads/:id/participants

- **Mount:** Already under `app.use('/api/chat', chatThreadsRoutes)`, so full path is `POST /api/chat/threads/:id/participants`.
- **Auth:** requireAuth; then `ensureThreadParticipant(params.id, req.user.id)`; if null → 403.
- **Body (proposed):** `{ participantType: 'external_provider' | 'tool_bridge', participantId?: string, providerKey: string, displayName?: string, capabilities?: string[] }`. For external_provider, participantId defaults to providerKey if omitted.
- **Handler skeleton:**

```js
// In chatThreadsRoutes.js
router.post('/threads/:id/participants', requireAuth, async (req, res, next) => {
  // 1) threadId = req.params.id; userId = req.user?.id; if (!userId) return 401
  // 2) thread = await ensureThreadParticipant(threadId, userId); if (!thread) return 403
  // 3) if (process.env.ENABLE_EXTERNAL_CHAT_PARTICIPANTS !== 'true') return 404 or 403
  // 4) Parse body: participantType, providerKey, displayName, capabilities
  // 5) Validate participantType in ['external_provider','tool_bridge']; providerKey in allowed set (e.g. chatgpt, perplexity, cursor)
  // 6) participantId = body.participantId || body.providerKey
  // 7) prisma.chatThreadParticipant.create({ data: { threadId, participantType, participantId, role: 'member', displayName, providerKey, capabilities: capabilities ?? undefined } })
  //    - catch P2002 (unique) → 409 "already added"
  // 8) return 201 + participant row (id, threadId, participantType, participantId, role, displayName, providerKey, capabilities, joinedAt)
});
```

- **New helper (optional):** `function validateExternalParticipantBody(body)` → { participantType, participantId, providerKey, displayName, capabilities } or throw 400. Keep in same file or `lib/chatThreadValidation.js` (no dependency on draft-store or auth contract changes).

### 3.2 POST /api/chat/threads/:id/ask-external

- **Full path:** `POST /api/chat/threads/:id/ask-external`.
- **Auth:** requireAuth; then `ensureThreadParticipant(params.id, req.user.id)`; if null → 403.
- **Body (proposed):** `{ participantId?: string, providerKey?: string, message: string }`. Resolve participant by participantId or providerKey (must be a participant of this thread with participantType in ['external_provider','tool_bridge']).
- **Handler skeleton:**

```js
// In chatThreadsRoutes.js
router.post('/threads/:id/ask-external', requireAuth, async (req, res, next) => {
  // 1) threadId = req.params.id; userId = req.user?.id; if (!userId) return 401
  // 2) thread = await ensureThreadParticipant(threadId, userId); if (!thread) return 403
  // 3) if (process.env.ENABLE_EXTERNAL_CHAT_PARTICIPANTS !== 'true') return 404 or 403
  // 4) Parse body: participantId or providerKey, message (required string)
  // 5) participant = await prisma.chatThreadParticipant.findFirst({ where: { threadId, participantType: { in: ['external_provider','tool_bridge'] }, OR: [ { id: participantId }, { participantId: providerKey }, { providerKey } ] } })
  //    - if (!participant) return 404 "Participant not found or not external"
  // 6) Use threadId as canonical; missionId only when thread has one (see §1.1): missionId = thread.missionId ?? null, threadId = thread.id. Never use thread.id as missionId.
  // 7) Call external adapter: askExternalProvider(providerKey, message, thread) → { text }
  // 8) createAgentMessage({ missionId: thread.missionId ?? null, threadId: thread.id, senderType: 'agent', senderId: participant.participantId, channel: 'main', text: response.text, messageType: 'text', payload: null, visibleToUser: true }) — requires createAgentMessage to allow nullable missionId when threadId is set (§1.1).
  // 9) return 201 { ok: true, messageId, participantId, text: response.text }
});
```

- **New service (new file):** `apps/core/cardbey-core/src/services/externalChat/askExternalProvider.js` (or similar):
  - **Signature (skeleton):** `async function askExternalProvider(providerKey, message, options = {})` → `Promise<{ text: string }>`. options may include threadId, userId (for rate limit/key resolution later). No dependency on DraftStore or orchestra. Implementation: switch on providerKey, read env key (e.g. OPENAI_API_KEY for chatgpt), call provider API; return normalized { text }. Phase 1 can stub and return a placeholder string.

### 3.3 POST /api/chat/threads/:id/commands/cursor (optional)

- **Full path:** `POST /api/chat/threads/:id/commands/cursor`.
- **Auth:** Same as ask-external: requireAuth + ensureThreadParticipant.
- **Body (proposed):** `{ command: string, payload?: object }` (e.g. “bundle” or “run” with payload). Optional: manual bundle/command for Cursor bridge.
- **Handler skeleton:**

```js
// In chatThreadsRoutes.js
router.post('/threads/:id/commands/cursor', requireAuth, async (req, res, next) => {
  // 1) threadId, userId, ensureThreadParticipant → 401/403 as above
  // 2) if (!ENABLE_EXTERNAL_CHAT_PARTICIPANTS) return 404/403
  // 3) Resolve Cursor participant for this thread (participantType tool_bridge or external_provider, providerKey 'cursor')
  // 4) Dispatch command (e.g. to a queue or Cursor bridge service); store result as AgentMessage if applicable
  // 5) return 202 Accepted { commandId } or 200 { result }
});
```

- **New file (optional):** `services/externalChat/cursorBridge.js` — `async function executeCursorCommand(threadId, command, payload, userId)` → stub 202 for Phase 1.

---

## 4) Minimal UI hooks (where to add “Add participant” + “Ask” buttons)

- **Existing component that shows participants list:** Not located by grep in the audit. Per audit, UI entry points are documented as:
  - **Agent Conversations (Beta):** sidebar → `/app/back/threads`
  - **Thread view:** `/app/back/threads/:threadId` (ConversationThread) or the chat view that uses **GET /api/chat/threads/:id** and **GET /api/chat/threads/:id/messages** (ChatThread).

- **Assumption:** The thread **detail** view that renders a single ChatThread (messages + participants) is the place to add:
  - **“Add participant”** button: opens a modal or dropdown to add a participant; calls **POST /api/chat/threads/:id/participants** with type `external_provider` and providerKey (e.g. `chatgpt`). List of participants should be fetched from **GET /api/chat/threads/:id** — **extend response** to include `participants` (today GET /api/chat/threads/:id does not return participants; see below).
- **“Ask [displayName]” button:** For each participant with participantType `external_provider` or `tool_bridge`, show an “Ask X” control (e.g. in the participant rail or next to the composer). On submit, call **POST /api/chat/threads/:id/ask-external** with participantId or providerKey and message; append returned message to the thread (or refetch messages / use SSE).

**Backend change for UI:** **GET /api/chat/threads/:id** currently returns only thread fields (id, missionId, title, createdByUserId, createdAt). To show participants (and their displayName, providerKey, capabilities), either:

- **Option A:** Extend **GET /api/chat/threads/:id** to include `participants: [...]` (prisma.conversationThread → ChatThread; include participants). Then UI uses same endpoint for thread + participants.
- **Option B:** Add **GET /api/chat/threads/:id/participants** that returns only participants; UI calls both GET thread and GET participants.

Recommendation: **Option A** (include participants in GET /api/chat/threads/:id) to avoid extra round-trip and keep one source of truth for “thread + who’s in it.”

**Summary table**

| Location | Change |
|----------|--------|
| Thread detail page (ChatThread) | Add “Add participant” → modal/dropdown → POST .../participants. |
| Same page | Show participants list (from GET thread response with participants); for each external_provider/tool_bridge show “Ask [displayName]” → POST .../ask-external. |
| GET /api/chat/threads/:id | Extend response with `participants: [{ id, participantType, participantId, role, displayName?, providerKey?, capabilities? }, ...]`. |

---

## 5) Security checklist

- [ ] **Reuse access control:** All new routes use **ensureThreadParticipant(threadId, req.user.id)** only. No new auth middleware; no change to requireAuth or optionalAuth.
- [ ] **Do not touch canAccessMission for DraftStore:** canAccessMission is used in agentMessagesRoutes and threadsRoutes for **mission/thread** access. We do not call it from draftStore or orchestra. New ask-external/participants use only ensureThreadParticipant (ChatThread).
- [ ] **Do not modify DraftStore:** No edits to `draftStore.js`, `orchestraBuildStore.js`, or `miRoutes.js` (orchestra/start). No shared imports from those files into chatThreadsRoutes or externalChat services.
- [ ] **Feature flag:** All new behavior (POST participants, POST ask-external, POST commands/cursor) gated by `ENABLE_EXTERNAL_CHAT_PARTICIPANTS === 'true'`. When false, return 404 or 403 with a clear code so UI can hide “Add participant” and “Ask X.”
- [ ] **Provider keys:** Phase 1: keys from env only (e.g. OPENAI_API_KEY). No key storage in DB or request body. Later (Phase 2) key storage must be tenant-scoped and never logged.
- [ ] **Rate limit (later):** Add per-user or per-thread rate limit for POST ask-external to avoid abuse; reuse existing rate-limit middleware pattern (e.g. keyGenerator: `ask-external:${userId}`) without touching draft-store or orchestra.
- [ ] **Audit:** No regression to DraftStore creation/summary/commit or orchestra/start; no change to 403 behavior for existing draft-store or thread routes.
- [ ] **missionId integrity:** For board-room messages, never set `missionId` to `thread.id`. Use `missionId: thread.missionId ?? null` and always `threadId: thread.id`. createAgentMessage accepts nullable missionId only when threadId is set; mission-scoped paths (canAccessMission, SSE token) are never given a fake missionId.

---

## File summary (no implementation)

| Item | File(s) |
|------|--------|
| **Prerequisite: AgentMessage.missionId optional** | `prisma/sqlite/schema.prisma`, `prisma/postgres/schema.prisma` — AgentMessage.missionId → String? |
| **Prerequisite: createAgentMessage nullable missionId** | `orchestrator/lib/agentMessage.js` — allow missionId null when threadId set; skip mission broadcast and plan_update block when missionId is null |
| Schema diff (participants) | `prisma/sqlite/schema.prisma`, `prisma/postgres/schema.prisma` (ChatThreadParticipant: displayName, providerKey, capabilities) |
| New routes | `routes/chatThreadsRoutes.js` — POST threads/:id/participants, POST threads/:id/ask-external, (optional) POST threads/:id/commands/cursor |
| GET thread include participants | `routes/chatThreadsRoutes.js` — GET /threads/:id: include participants in response |
| External provider adapter | New: `services/externalChat/askExternalProvider.js` (skeleton) |
| Optional Cursor bridge | New: `services/externalChat/cursorBridge.js` (stub) |
| UI | Thread detail page: Add participant + Ask X; consume GET thread with participants and POST ask-external (exact component paths TBD in dashboard repo). |
