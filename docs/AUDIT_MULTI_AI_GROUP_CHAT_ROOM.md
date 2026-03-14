# CURSOR AUDIT — Cardbey “Multi-AI Group Chat Room” Capability

**Date:** 2026-03-03  
**Scope:** Audit only (no implementation). Assess existing Agent Chat / Mission / Threads / Participants / Tasks and gaps for a unified “group chat room” with Human + Internal agents (Planner, Research) + External providers (ChatGPT, Perplexity) + Cursor bridge.

---

## 0) Risk check (workflow safety)

### Components that touch store creation workflows

| Component | Touches DraftStore/Orchestrator? | Risk |
|-----------|----------------------------------|------|
| **draftStore.js** | Yes — draft create, summary, commit | **Critical** — do not refactor; keep isolated. |
| **orchestraBuildStore.js** | Yes — createBuildStoreJob, runBuildStoreJob | **Critical** — same. |
| **miRoutes.js** | Yes — handleOrchestraStart creates draft + task | **Critical** — same. |
| **agentMessagesRoutes.js** | No — missionId = OrchestratorTask.id; no DraftStore | Low for store flow. |
| **threadsRoutes.js** | Indirect — getOrCreateMission creates OrchestratorTask (entryPoint `agent-chat`); no DraftStore | Low for store flow. |
| **chatThreadsRoutes.js** | No — ChatThread + participants only | Low. |
| **missionsRoutes.js** | No — Mission, AgentRun, dispatch; no DraftStore | Low for store flow. |
| **agentChatTurn.js** | No — handles user turn after message; creates AgentRun | Low for store flow. |
| **agentRunExecutor.js** | No — runs planner/research/ocr; no DraftStore | Low for store flow. |

### Coupling risks and isolation boundaries

- **HIGH RISK:** Any change that shares code paths between (1) **DraftStore creation/summary/commit** or **orchestra/start** and (2) **thread/agent-messages/missions** could break store creation or cause 403s. Keep DraftStore and orchestra/start logic **fully isolated** from new “group chat” participant/provider code.
- **Recommendation:** New “external participant” (ChatGPT, Perplexity, Cursor) features must use **separate routes** (e.g. `/api/chat/threads/:id/ask-external`), **separate tables or columns** (e.g. `ExternalParticipant`, or `Participant.providerType`), and **feature flags** (e.g. `ENABLE_EXTERNAL_CHAT_PARTICIPANTS`) so they can be toggled without touching draft-store or orchestra.

---

## 1) Current system map (as-is)

### UI entry points (from docs; paths may live under dashboard)

| Path / concept | Source | Notes |
|----------------|--------|--------|
| Agent Conversations (Beta) | `docs/AGENT_CONVERSATIONS_V0_VERIFICATION.md` | Sidebar → `/app/back/threads`. |
| Thread view | Same | `/app/back/threads/:threadId`. |
| Agent Chat (mission-based) | `docs/AGENT_CHAT_DATA_PATHS_VERIFICATION.md` | `/app/back/missions/:missionId/chat`. |
| New conversation | Same | Create thread with optional title/agents; bind to new or existing mission. |

*Note: Grep for `threads` / `missions` / `AgentChat` under `apps/dashboard` did not find matches; UI may live under different names or routes. Treat the above as documented intended entry points.*

### API routes (Express)

| Mount | File | Key routes |
|-------|------|------------|
| `/api` | `routes/agentMessagesRoutes.js` | `POST/GET /api/agent-messages`, `POST /api/agent-messages/stream-token` |
| `/api/agent-chat` | `routes/agentChatRoutes.js` | e.g. attachments/OCR |
| `/api/chat` | `routes/chatScopeRoutes.js` | `POST /api/chat/resolve-scope` |
| `/api/chat` | `routes/chatThreadsRoutes.js` | `POST/GET /api/chat/threads`, `GET /api/chat/threads/:id/messages`, `GET /api/chat/threads/:id/stream` |
| `/api/threads` | `routes/threadsRoutes.js` | `GET/POST /api/threads`, `GET /api/threads/:threadId` |
| `/api/missions` | `routes/missionsRoutes.js` | `GET /api/missions/recent-for-threads`, `POST /api/missions/:missionId/dispatch` |
| `/api/draft-store` | `routes/draftStore.js` | Draft create, generate, summary, commit (no thread/agent chat) |
| `/api/mi` | `routes/miRoutes.js` | orchestra/start, job, etc. (store build; no thread chat) |

### Services / controllers

| Area | Path | Role |
|------|------|------|
| Agent messages | `orchestrator/lib/agentMessage.js` | createAgentMessage (DB + broadcast) |
| User turn | `orchestrator/agentChatTurn.js` | handleUserTurn (intent → planner/ops run) |
| Agent run execution | `lib/agentRunExecutor.js` | executeAgentRunInProcess (planner, research, ocr, ops, internal tools) |
| Planner | `lib/plannerExecutor.js` | runPlannerInProcess |
| Mission | `lib/mission.js` | getOrCreateMission, mergeMissionContext |
| Agent run | `lib/agentRun.js` | createAgentRun, updateAgentRunStatus |
| Chat scope | `lib/chatScope.js` | resolveChatScope, ensureMissionForThread |
| Stream auth | `lib/agentChatStreamAuth.js` | issueStreamToken; SSE verifies token |
| Intent | `lib/agentIntentRouter.js` | classifyIntent (e.g. MARKETING, FIX_IMAGE_MISMATCH) |

### Prisma schema location

- **SQLite:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma`
- **Postgres:** `apps/core/cardbey-core/prisma/postgres/schema.prisma` (if used)
- **Client:** Generated to `node_modules/.prisma/client-gen` (see `db/prisma.js`).

### Queues / jobs for agent execution

- **In-process:** `executeAgentRunInProcess(runId)` — no separate queue; runs in Node (research/planner/ocr/ops) behind env flags (`MISSION_RUN_INPROCESS`, `MISSION_PLANNER_INPROCESS`).
- **OrchestratorTask:** Used for (1) store-build jobs (orchestra/start) and (2) agent-chat “mission” when thread has no missionId (getOrCreateMission creates task with `entryPoint: 'agent-chat'`). Not a generic “run external LLM” queue.

---

## 2) Data model audit

### Relevant Prisma models (from `prisma/sqlite/schema.prisma`)

**Mission**

- `Mission`: id (used as missionId), tenantId, createdByUserId, title?, status, context (Json), createdAt, updatedAt. Relation: MissionCreator (User), AgentRun[].
- Represents a “mission” as a first-class entity (separate from OrchestratorTask). Used with AgentRun and mission context.

**OrchestratorTask**

- entryPoint, tenantId, userId, status, request (Json), result (Json), insightId, createdAt, updatedAt.
- When `entryPoint = 'agent-chat'`, task.id is used as **missionId** for agent-messages and threads (getOrCreateMission in threads creates a task and uses task.id as missionId).
- Relation: `messages AgentMessage[]` when missionId = task id.

**AgentMessage**

- id, missionId, senderType ('user' | 'orchestrator' | 'agent'), senderId (userId or agentId), visibleToUser, channel, performative?, messageType ('text' | …), content (Json), payload (Json?), createdAt.
- Optional: taskId → OrchestratorTask, threadId → ChatThread.
- Messages are stored and attributed by senderType + senderId; no separate “Participant” table for messages (senderId is denormalized).

**ConversationThread**

- id, tenantId, title?, missionId (OrchestratorTask.id or mission id), createdByUserId, status, kind?, scopeKey?, createdAt, updatedAt.
- Relations: createdBy (User), ThreadParticipant[].

**ThreadParticipant**

- id, threadId, participantType ('user' | 'agent'), participantId (userId or agentKey e.g. planner, research), role ('owner' | 'member' | 'viewer'), createdAt, updatedAt.
- Unique (threadId, participantType, participantId). Represents “participants” today: user vs agent (by agentKey string).

**ChatThread**

- id, missionId?, title?, createdByUserId, createdAt. Relations: createdBy (User), ChatThreadParticipant[], AgentMessage[] (via threadId).
- Alternative thread model; messages can link to ChatThread via AgentMessage.threadId.

**ChatThreadParticipant**

- id, threadId, participantType ('user' | 'agent'), participantId, role, joinedAt.
- Same idea as ThreadParticipant but for ChatThread.

**AgentRun**

- id, missionId, tenantId, agentKey, triggerMessageId?, status, input?, output?, error?, createdAt, updatedAt.
- Represents a single “run” of an agent (research, planner, ocr, etc.). Relation: Mission, Assignment (bidding layer).

**AgentTask, Assignment, AgentProfile, InteractionFeedback**

- Bidding/matching layer: AgentTask (missionId, type, payload, status), Assignment (taskId, agentKey, agentRunId), AgentProfile (agentKey, skills, baseQuality, baseCost, baseLatency), InteractionFeedback.
- Not required for basic group chat; used for task routing and learning.

**AgentChatConfig**

- missionId (unique), useResearchAgent (boolean), updatedAt. Per-mission toggle for Research Agent.

**MissionTask**

- missionId, title, normalizedLabel, description, status, sourceMessageId, chainId, suggestionId, agentKey?, agentKeyRecommended?, intent?, risk?, lastRunId?, meta. Executable tasks from planner plan_update.

### Answers to audit questions

- **What represents a “mission” today?**  
  - **OrchestratorTask** when `entryPoint = 'agent-chat'` (task.id used as missionId for messages and threads).  
  - **Mission** model also exists (id, tenantId, createdByUserId, context); used with AgentRun and mission context. So “mission” can be either an OrchestratorTask id or a Mission id depending on flow.

- **What represents “participants” today?**  
  - **ThreadParticipant** (ConversationThread) and **ChatThreadParticipant** (ChatThread): participantType = 'user' | 'agent', participantId = userId or agentKey (e.g. planner, research). No displayName or “capability” field; no external provider type.

- **How are messages stored and attributed?**  
  - **AgentMessage**: missionId, senderType, senderId, channel, messageType, content, payload. Attribution is by senderType + senderId (user id or agent key string). No FK to a “Participant” row.

- **How is access controlled?**  
  - **agent-messages / stream:** `canAccessMission(missionId, user)` — when missionId is an OrchestratorTask id: allow if task.userId or task.tenantId matches user.id or user.business.id; dev bypass for 'temp' / 'dev-user-id'.  
  - **threads:** `canAccessThread(threadId, user)` — user must be a ThreadParticipant (participantType=user, participantId=user.id) or super_admin/dev bypass; if thread has missionId, also canAccessMission.  
  - **missions dispatch:** same canAccessMission.  
  - **DraftStore:** canAccessDraftStore (ownerUserId, input.tenantId, task ownership, store ownership, super_admin). No shared “tenantKey” model with threads; threads use tenantId on ConversationThread and task.tenantId.

- **Is there a concept of “agent type” / “capability” today?**  
  - **agentKey** (string) on AgentRun and ThreadParticipant (e.g. planner, research, ocr, ops). No enum or “capability” tags (reasoning, research, coding, media). No “external_provider” or “tool_bridge” type.

---

## 3) Runtime / orchestration audit

- **How does an “agent run” happen today?**  
  - User sends message → POST /api/agent-messages → create AgentMessage → handleUserTurn(missionId, …) → classifyIntent → createAgentRun(agentKey: 'planner' | 'ops' | …) → executeAgentRunInProcess(run.id).  
  - In-process execution (no external queue): research/planner/ocr/ops run inside Node; env flags gate planner/research.

- **Where is routing logic (planner → research → output)?**  
  - **agentChatTurn.js:** intent classification → FIX_IMAGE_MISMATCH → ops run; else planner run.  
  - **agentRunExecutor.js:** by agentKey (research, planner, ocr, ops, internal tools, bidding); planner uses plannerExecutor; research uses research path; no “router” that picks among multiple LLM providers.

- **Generic “tool invocation” abstraction?**  
  - Orchestrator has **tools registry** (`orchestrator/toolsRegistry.js`) and engines (device, menu, promo, signage, loyalty). Agent chat uses **AgentRun + agentRunExecutor** (planner/research/ocr), not the same tools registry for chat. No single “tool invocation” abstraction that covers both.

- **Where are provider calls made (LLM, web search)?**  
  - Inside **plannerExecutor**, **research** (and related) services; no shared “provider adapter” layer visible at route level. LLM calls are internal to those modules.

- **How are outputs written back to a thread?**  
  - **createAgentMessage** (orchestrator/lib/agentMessage.js): writes AgentMessage to DB and broadcasts (e.g. simpleSse). No separate “write to thread” API; thread is bound via missionId (and optionally threadId on AgentMessage).

---

## 4) Gaps vs target (“to-be”)

**Target:** Group chat room with Human + Internal agents (Planner, Research) + External (ChatGPT, Perplexity) + Cursor bridge; unified “capability participant” model.

### DB models

| Gap | Current | Needed |
|-----|---------|--------|
| Participant type | participantType: 'user' \| 'agent'; participantId = userId or agentKey | type: human \| internal_agent \| external_provider \| tool_bridge; capability tags; optional provider config ref. |
| External participant | None | Model or columns for external provider (e.g. ChatGPT, Perplexity, Cursor): id, displayName, type, capability tags, encrypted provider key ref or env key name. |
| Message attribution | senderType + senderId on AgentMessage | Optional senderParticipantId → Participant; keep backward compatibility with senderId. |
| Thread visibility/routing | status, kind, scopeKey on ConversationThread | Optional routing rules (e.g. “manual trigger first”) and visibility. |

### API routes

| Gap | Current | Needed |
|-----|---------|--------|
| Add external participant | No API to add “ChatGPT” or “Perplexity” to a thread | POST /api/threads/:id/participants or /api/chat/threads/:id/participants with type=external_provider, providerKey, displayName. |
| “Ask X” (external) | No endpoint to trigger external provider | POST /api/chat/threads/:id/ask or /api/threads/:id/ask with participantId or providerKey; returns or streams response, stored as message attributed to that participant. |
| List participants with capabilities | GET thread returns participants with type/role only | Include capability tags and displayName so UI can show “Ask ChatGPT”, “Ask Cursor”. |

### UI

| Gap | Current | Needed |
|-----|---------|--------|
| Add participant | Thread creation allows agents (planner, research); no “Add participant” in thread view | “Add participant” → choose internal agent or external (ChatGPT, Perplexity, Cursor); optional provider config (key selection). |
| “Ask X” button | No per-participant “Ask ChatGPT” / “Ask Perplexity” / “Ask Cursor” | Per-participant “Ask” that calls new ask-external endpoint and shows response in thread. |
| Participant display | participantId as string (agentKey or userId) | displayName, type badge, capability tags. |

### Security / tenancy

| Gap | Current | Needed |
|-----|---------|--------|
| Provider keys | No storage for OpenAI/Perplexity/Cursor keys per tenant or user | Secure key storage (env per tenant, or vault, or encrypted column); never log keys. |
| Scope external to thread | N/A | Only thread participants can “Ask X”; enforce same canAccessThread / canAccessMission before calling external API. |
| Audit | AgentMessage stores sender; no “provider call” log | Optional audit table or payload for “message from external provider X” (provider id, model, token usage, no PII). |

### Logging / audit

| Gap | Current | Needed |
|-----|---------|--------|
| External call log | No | Log provider key id, model, success/failure, latency; optional token usage for billing. |

---

## 5) Minimal integration plan (low-risk)

### Phase 1 — Manual, safe (external as non-executing entities)

- **Goal:** Add ChatGPT / Perplexity / Cursor as **participants** (display only or manual “Ask X” that calls new isolated endpoints). No auto-run; no change to planner/research flow.
- **New:**
  - **DB:** Optional table `ExternalParticipant` or extend participant model: id, threadId, type='external_provider', providerKey ('chatgpt'|'perplexity'|'cursor'), displayName, capabilityTags (Json), createdAt. No key storage yet; keys from env only.
  - **API:**  
    - POST /api/threads/:threadId/participants (or /api/chat/threads/:id/participants) — body: { type: 'external_provider', providerKey, displayName }. requireAuth; canAccessThread(threadId); create participant.  
    - POST /api/threads/:threadId/ask-external (or /api/chat/threads/:id/ask-external) — body: { participantId or providerKey, message: string }. requireAuth; canAccessThread; resolve participant; call **new** isolated adapter (e.g. `services/externalChat/chatgptAdapter.js`) that reads key from env; store response as AgentMessage with senderType='agent', senderId=participantId or providerKey.
  - **UI:** “Add participant” → External → choose ChatGPT / Perplexity / Cursor; show in rail. “Ask ChatGPT” button → call ask-external → append message to thread.
- **Existing files to modify (minimal):**
  - threadsRoutes.js or chatThreadsRoutes.js: add POST participants and POST ask-external (new handlers; do not change existing GET/POST thread or message list).
  - Optionally agentMessagesRoutes.js: allow creating message with senderType='agent' and senderId=external participant id (if not already allowed).
- **Feature flag:** ENABLE_EXTERNAL_CHAT_PARTICIPANTS; when false, new routes 404 or skip registration.
- **Acceptance:** Create thread → add “ChatGPT” participant → send “Ask ChatGPT” with a message → 200, response stored and visible; wrong tenant/user gets 403.

### Phase 2 — Provider execution (keys, adapters, rate limits)

- **Goal:** Secure key storage (env or vault or encrypted table per tenant); rate limits and optional budget (reuse or isolate from llmBudget).
- **New:**
  - **Key storage:** Design: env vars (e.g. OPENAI_API_KEY per tenant) or encrypted column in Tenant/User or ExternalParticipant (e.g. encryptedApiKey). Never log keys.
  - **Adapters:** services/externalChat/chatgptAdapter.js, perplexityAdapter.js, cursorBridgeAdapter.js — each: receive (message, options), return stream or full text; read key from secure resolution.
  - **Rate limits:** Per user or per thread for ask-external (e.g. 10/min); optional token budget per tenant (separate from existing llmBudget for store generation).
- **Existing to modify:** Same routes as Phase 1; add key resolution and adapters; add rate-limit middleware for ask-external only.
- **Feature flag:** Same; add ENABLE_EXTERNAL_CHAT_KEYS or use same flag.
- **Acceptance:** Configure key (env or UI) → “Ask ChatGPT” uses it; over limit → 429; wrong tenant → 403.

### Phase 3 — Orchestration (routing rules, audit)

- **Goal:** Optional “routing rules” (e.g. “first message to ChatGPT then to planner”); audit events for each external run.
- **New:**
  - **Routing:** Table or Json on thread: rules like [{ trigger: 'first_message', targetParticipantId, order }]. Executor that, after user message, posts to external participant then internal (or vice versa). Fully optional; default = current behavior (no external auto-run).
  - **Audit:** Table or AgentMessage.payload: eventType='external_provider_call', participantId, providerKey, model, success, latencyMs, tokenUsage (optional).
- **Existing to modify:** agentChatTurn or a new “thread message handler” that checks routing rules; no change to handleUserTurn for planner-only path when rules empty.
- **Feature flag:** ENABLE_EXTERNAL_CHAT_ROUTING.
- **Acceptance:** Rule “first reply by ChatGPT” → user sends message → ChatGPT reply appears then planner can run; audit row exists.

---

## 6) Acceptance checklist

- [ ] **Thread creation:** A thread can be created (POST /api/threads or /api/chat/threads); response includes thread id and participants.
- [ ] **Participants:** Participants can be added (user + agents; Phase 1: external as non-executing entity with “Ask X”).
- [ ] **Send message / get response from “ChatGPT participant”:** User clicks “Ask ChatGPT” with text; POST ask-external; response appears as message attributed to ChatGPT; GET messages includes it.
- [ ] **Access control:** Wrong tenant or non-participant user gets 403 on GET/POST thread, GET/POST messages, POST ask-external.
- [ ] **No regression to DraftStore:** Create store via Quick Start (template or AI) → GET /api/draft-store/:draftId/summary → 200 for owner; no change in behavior after adding thread/participant/ask-external code.
- [ ] **No regression to orchestra/start:** POST /api/mi/orchestra/start → draft and task created; GET summary 200; no change after new routes.

---

## File path reference (quick)

| Purpose | Path |
|---------|------|
| Agent messages API | `apps/core/cardbey-core/src/routes/agentMessagesRoutes.js` |
| Threads API | `apps/core/cardbey-core/src/routes/threadsRoutes.js` |
| Chat threads API | `apps/core/cardbey-core/src/routes/chatThreadsRoutes.js` |
| Chat scope | `apps/core/cardbey-core/src/routes/chatScopeRoutes.js` |
| Missions API | `apps/core/cardbey-core/src/routes/missionsRoutes.js` |
| Agent chat (attachments) | `apps/core/cardbey-core/src/routes/agentChatRoutes.js` |
| User turn → planner/ops | `apps/core/cardbey-core/src/orchestrator/agentChatTurn.js` |
| Agent run execution | `apps/core/cardbey-core/src/lib/agentRunExecutor.js` |
| Create message + broadcast | `apps/core/cardbey-core/src/orchestrator/lib/agentMessage.js` |
| Mission helper | `apps/core/cardbey-core/src/lib/mission.js` |
| Stream token (SSE) | `apps/core/cardbey-core/src/lib/agentChatStreamAuth.js` |
| Prisma schema (SQLite) | `apps/core/cardbey-core/prisma/sqlite/schema.prisma` |
| DraftStore (do not couple) | `apps/core/cardbey-core/src/routes/draftStore.js`, `services/draftStore/orchestraBuildStore.js` |
| Orchestra start (do not couple) | `apps/core/cardbey-core/src/routes/miRoutes.js` (handleOrchestraStart) |
