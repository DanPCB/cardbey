# AI Operator + Agent Chat Integration

Merge the Mission Console (Pipeline / AI Operator) with Agent Chat so the AI Operator uses Planner / Research / Reviewer internally. This doc locates both systems, proposes the integration, and gives a concrete implementation checklist.

---

## 1. Agent Chat orchestration (current)

### 1.1 Agent definitions

| Agent | Location | Role |
|-------|----------|------|
| **Planner** | `apps/core/cardbey-core/src/agents/plannerAgent.ts` | Reasons over user message + optional Research summary; replies in text; can emit plan_update / execution_suggestions (Next Steps). **Does not call tools** — "Do not call tools; just reply in plain text." |
| **Research** | `apps/core/cardbey-core/src/agents/researchAgent.ts` | Perplexity-backed; answers questions for the mission; posts `research_result` to AgentMessage. **No tool calls**; calls external Perplexity API only. |
| **Reviewer** | UI only in `AgentChatView.tsx` (AGENT_KEYS: reviewer, Reviewer Agent). No backend `reviewerAgent` found; `review_result` is a **message type** (payload validation in `agentMessagesRoutes.js`), not a separate agent runner. |

Backend agent profiles (for bidding) in `apps/core/cardbey-core/src/lib/agentProfile.js`: `planner`, `research`, `ocr` (no reviewer).

### 1.2 Message routing / orchestration

- **Entry:** `POST /api/agent-messages` (body: `missionId`, `text`, optional `threadId`). Creates an AgentMessage (user), then calls **handleUserTurn** (fire-and-forget).
- **handleUserTurn** (`apps/core/cardbey-core/src/orchestrator/agentChatTurn.ts`):
  - Resolves `chatMode` from Mission.context (default vs group_chat) and `useResearchAgent` from AgentChatConfig.
  - **group_chat:** Runs Research first (with timeout ~25s), then Planner with research summary; both post to AgentMessage and broadcast via SSE.
  - **default:** Optional Research then Planner; Planner reply is the main response.
  - Agents **do not** receive a tool list; they only get user message + research summary and reply with text (and optional structured payloads like plan_update).
- **Bidding layer (optional):** When enabled, createAgentTask + runAuction + executeAgentRunInProcess; agents are invoked via AgentRun, not direct runPlannerAgent/runResearchAgent from the turn handler.

### 1.3 Thread / session model

- **AgentMessage** (Prisma): `missionId`, optional `threadId` → ChatThread. Messages are queried by `missionId` in `GET /api/agent-messages?missionId=...`.
- **ChatThread** (Prisma, referenced in agentMessagesRoutes): `id`, `missionId`, `title`, `createdByUserId`. **ChatThreadParticipant** links thread to user/agent. When POST body includes `threadId`, missionId is derived from the thread and access is checked via participant.
- **ConversationThread** (used in `apps/core/cardbey-core/src/routes/threadsRoutes.js`): Different model — `POST /api/threads` creates ConversationThread + ThreadParticipant, sets `missionId` (or creates an OrchestratorTask with entryPoint `agent-chat` and uses task.id as missionId). GET/POST under `/api/threads`.
- **Assumption:** The dashboard "Agent Chat (Test)" screen likely uses `missionId` (e.g. OrchestratorTask id or test mission id) for GET /api/agent-messages; threadId is optional and used when the UI creates a thread via `/api/threads` and passes threadId when posting. For Operator we can use either: create a thread via **POST /api/threads** with `missionId` = dashboard mission id (or MissionRun id) and store that thread id on MissionRun as `agentThreadId`.

### 1.4 Tools exposed to agents today

- **None.** Planner and Research do not receive a tool schema or make tool calls. They produce text (and structured payloads like plan_update, research_result). Tool-calling (e.g. for Operator tools) would require a new path: e.g. a dedicated “Operator turn” that sends a system + state message and asks the model to respond with a **tool call** (or a structured choice), which the backend then executes.

---

## 2. Mission Console — Pipeline / AI Operator toggle (current)

### 2.1 Where the toggle is defined

- **Plan mode** is a type in code only: `PlanMode = 'pipeline' | 'operator'` in `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/planGenerator.ts`.
- **generatePlan({ text, mode })** returns a Plan with `mode` and steps: for `mode === 'operator'`, steps are wrapped with an extra **human-approval** step and validate depends on it (`operatorSteps(base)`).
- **No UI toggle found** in the Mission Console: no component sets `mode: 'operator'` when generating the plan. The console appears to use a single path (effectively pipeline). Tests in `planGenerator.test.ts` call `generatePlan(..., mode: 'pipeline')`.

### 2.2 Where missions are started (store)

- **Store missions:** `ConsoleContext.tsx` → `startExecution(missionId)`. If plan is store and `!mission.artifacts?.storeId`, it builds payload from `mission.input`, calls **quickStartCreateJob** (POST /api/mi/orchestra/start), then updates `mission.artifacts` (storeId, jobId, generationRunId, runtimeUrl), inits execution, and runs **runAll(plan, missionId, updateMission, ...)** (DAG in browser).
- **Operator path:** Not implemented. There is no branch that checks `plan.mode === 'operator'` and calls `POST /api/ai-operator/missions/:missionId/start` instead of quickStartCreateJob + runAll. The **AI Operator API** and **runOperatorStep** are proposed in `docs/AI_OPERATOR_ARCHITECTURE.md` but not yet built.

### 2.3 Relevant React components and API calls

| Component | Role | API calls today |
|-----------|------|------------------|
| **ConsoleContext.tsx** | Holds missionSnapshot, startExecution, cancelExecution, retryExecution | quickStartCreateJob (POST /api/mi/orchestra/start), then client-side runAll (no Operator API). |
| **StoreRunwayPanel.tsx** | Store runway form; “Advanced” shows “Open pipeline runtime (debug)” link | quickStartCreateJob (skipNavigate), updateMission (local). |
| **dagExecutor.ts** | runAll(plan, missionId, ...) | Step handlers call getOrchestraJob (GET /api/mi/orchestra/job/:jobId), getDraftIdByGenerationRunId, getDraftStoreSummary, etc. |
| **stepHandlers.ts** | runStepHandler(mission, stepId, ...) | Same APIs as above; no Operator. |

To add Operator mode: when starting a store mission in “AI Operator” mode, call `POST /api/ai-operator/missions/:missionId/start` instead of quickStartCreateJob, then poll `GET /api/ai-operator/missions/:missionId/status` and map `currentStage` to execution nodeStatus / report.

---

## 3. Integration proposal: Operator + Agent Chat

### 3.1 Create an Agent Chat thread per MissionRun

- When **POST /api/ai-operator/missions/:missionId/start** is called:
  - Create or load **MissionRun** (Operator state).
  - **Create or reuse a conversation thread** for this mission:
    - Option A: Call the same logic as **POST /api/threads** (or extract a shared `createThreadForMission(missionId, userId, tenantId)`): create ConversationThread with `missionId` = dashboard `missionId`, add user (and agents: planner, research) as participants. Store returned **thread.id** in MissionRun as **agentThreadId**.
    - Option B: If your schema uses ChatThread for agent messages, create a ChatThread + ChatThreadParticipant and store that id as agentThreadId. Use the same thread for GET /api/agent-messages when the frontend opens “Advanced view.”
- **MissionRun** shape (extend from AI_OPERATOR_ARCHITECTURE.md): add **agentThreadId** (string, optional). So: `id`, `missionId`, `missionType`, `goal`, `currentStage`, `currentDraftId`, `currentJobId`, `currentGenerationRunId`, `attempts`, `maxAttempts`, `status`, `lastError`, **agentThreadId**, `createdAt`, `updatedAt`.

### 3.2 Use Planner / Research / Reviewer to decide the next Operator tool

- Today agents do not choose tools. To use them for the Operator:
  - **Option A (recommended for v1):** Keep **runOperatorStep** rule-based (as in the architecture doc). In parallel, **post a synthetic “Operator state” message** into the Agent thread (e.g. system or orchestrator message) so the thread contains a readable log of what the Operator did (stage, jobId, draftId, success/failure). The **Planner/Research do not decide the tool**; they only provide a human-readable narrative in the same thread. Later, add a second phase where the model suggests the next tool.
  - **Option B (full agent-driven):** Add an **Operator turn**: send a system message + state summary to the thread, and run a **single agent call** (e.g. Planner with a special system prompt) that is **constrained to respond with one tool name + params** from a whitelist (start_build_store, poll_orchestra_job, get_draft_by_run, get_draft_summary, publish_store, log_event). Parse the reply (or use OpenAI tool-calling) and execute that one tool; then append the tool result to the thread and update Operator state. Repeat until status is succeeded | failed | needs_human.
- **Reviewer:** Currently no backend Reviewer agent. For “needs_human” or approval checkpoints, you can either (1) add a Reviewer agent that posts `review_result` (approve / changes_requested) or (2) keep human approval in the UI and only use Planner/Research for tool selection and interpretation.

### 3.3 runOperatorStepWithAgents(missionRunId) — sketch

- **Load** OperatorState (MissionRun) by missionRunId.
- If status !== 'running', return state.
- **Ensure thread exists:** if !state.agentThreadId, create thread (e.g. via shared createThreadForMission(missionId, userId, tenantId)), save thread.id to state.agentThreadId.
- **Build state summary** (goal, currentStage, currentJobId, currentDraftId, currentGenerationRunId, lastError, attempts/maxAttempts).
- **Append a system/orchestrator message** to the thread: e.g. “Operator step. State: … Goal: …” so the Agent Chat UI shows it.
- **Decide next action:**
  - **Policy (v1):** Use the same rule-based logic as **runOperatorStep** (if no jobId → start_build_store; if running_job → poll_orchestra_job; etc.). Do **not** call the LLM for tool choice yet.
  - **Agent-driven (v2):** Call Planner (or a dedicated “Operator Planner”) with system prompt: “You are the Operator. Given the state summary, reply with exactly one tool call from this list: start_build_store, poll_orchestra_job, get_draft_by_run, get_draft_summary, publish_store, log_event. Format: tool_name and JSON params.” Parse reply (or use tool_calls), validate tool name against whitelist, then run that tool.
- **Execute one tool** from the registry (same as runOperatorStep).
- **Update state** from tool result (currentStage, currentJobId, draftId, etc.).
- **Append tool result** to the thread (orchestrator message: “Called X; result: …”).
- **Decide terminal:** if succeeded / failed / needs_human, set status and return. Otherwise increment attempts; if attempts >= maxAttempts, set status = 'needs_human'.
- **Return** updated state.

File location: same folder as runOperatorStep, e.g. `apps/core/cardbey-core/src/ai/operator/runOperatorStepWithAgents.ts` (or .js), calling shared helpers for thread creation and message append.

### 3.4 Constraining agents to Operator tool whitelist

- **Whitelist:** `['start_build_store','poll_orchestra_job','get_draft_by_run','get_draft_summary','publish_store','log_event']`.
- In the agent prompt (when using Option B): “You may only respond with one of these tools and its parameters: …” and parse the reply (or use OpenAI function/tool calling with a schema that only includes these names). Server-side validation: before executing, check `toolName in WHITELIST` and that params match expected shape; otherwise log and set status to needs_human or retry.

---

## 4. API and UI wiring

### 4.1 API: create/reuse thread and expose Agent Chat link

- **POST /api/ai-operator/missions/:missionId/start**
  - Create MissionRun (status running), create or get thread (e.g. create via same logic as POST /api/threads with missionId), set MissionRun.agentThreadId = thread.id.
  - Kick first **runOperatorStepWithAgents(missionRunId)** (or runOperatorStep if not using agents yet).
  - Response: `{ missionRunId, status, currentStage, agentThreadId }` so the dashboard can open Agent Chat with this thread.
- **GET /api/ai-operator/missions/:missionId/status**
  - Return MissionRun state: currentStage, progress, artifacts (draftId, jobId, storeId), **agentThreadId**, status.
  - The dashboard uses agentThreadId to deep-link to the Agent Chat screen (“Advanced view”).

### 4.2 Dashboard: “Advanced view” → Agent Chat

- **Where to add the button:** In the **Mission Execution drawer** (the panel that shows execution progress when a mission is running or completed). Same place as (or next to) “Open pipeline runtime (debug)” when Operator mode is used.
- **Behavior:** When the mission is driven by the Operator (e.g. mission has a run with agentThreadId), show an **“Advanced view”** (or “Open Agent Chat”) button that navigates to the Agent Chat screen with **threadId = agentThreadId** (or missionId = missionId so messages for that mission are shown). If the Agent Chat route is e.g. `/console/agent-chat?threadId=...` or `?missionId=...`, set the link to include the mission’s Operator run’s agentThreadId (or missionId).
- **Assumption:** The Agent Chat page currently takes missionId (from route or context). You may need to add support for `threadId` in the route (e.g. `/console/agent-chat/:threadId` or `?threadId=...`) and pass threadId when posting messages so the thread’s messages are used. If the thread’s missionId equals the dashboard mission id, opening by missionId may already show the same messages; then “Advanced view” can simply navigate to `/console/agent-chat?missionId=<missionId>` and optionally pass a query or state that highlights “Operator run” or the thread.

---

## 5. Implementation checklist (order and file paths)

| # | Task | Path / notes |
|---|------|--------------|
| 1 | Add MissionRun / OperatorState model and repo helpers | Prisma: `apps/core/cardbey-core/prisma/**/schema.prisma` — add model MissionRun (id, missionId, missionType, goal, currentStage, currentDraftId, currentJobId, currentGenerationRunId, attempts, maxAttempts, status, lastError, agentThreadId, createdAt, updatedAt). Repo: `apps/core/cardbey-core/src/ai/operator/operatorState.ts` — loadOperatorState(missionRunId), saveOperatorState(missionRunId, patch), createMissionRun(params). |
| 2 | Implement Operator tool registry | `apps/core/cardbey-core/src/ai/operator/tools/index.ts` — wrap start_build_store (orchestra/start), poll_orchestra_job (orchestra job get), get_draft_by_run (draftStoreService.getDraftByGenerationRunId or stores/temp/draft), get_draft_summary (draft-store summary), publish_store (draft-store commit), log_event (append to run log or AuditEvent). Typed registry: toolName → handler. |
| 3 | Add minimal rule-based runOperatorStep for build_store | `apps/core/cardbey-core/src/ai/operator/runOperatorStep.ts` — load state, if build_store then branch on currentStage (planning → start_build_store; running_job → poll_orchestra_job; checking_draft → get_draft_summary; etc.), call one tool, update state, set status when done or needs_human. Max attempts guard. |
| 4 | Integrate Agent Chat: thread per MissionRun + runOperatorStepWithAgents | (a) On MissionRun create (in start handler), create thread via existing POST /api/threads logic (or shared createThreadForMission), set MissionRun.agentThreadId. (b) `apps/core/cardbey-core/src/ai/operator/runOperatorStepWithAgents.ts` — load state, ensure thread (create if missing), append state summary message to thread, run same rule-based step as runOperatorStep (v1) or add Planner call that returns tool name + params and execute that tool (v2), append tool result to thread, update state. |
| 5 | Wire Mission Console to Operator APIs and “Advanced view” | (a) **API:** `apps/core/cardbey-core/src/routes/aiOperatorRoutes.js` — POST missions/:missionId/start (create MissionRun, create thread, set agentThreadId, call runOperatorStepWithAgents or runOperatorStep); GET missions/:missionId/status (return state + agentThreadId). (b) **Dashboard:** In ConsoleContext (or wherever startExecution lives), when plan.mode === 'operator' (after you add the toggle) and plan.type === 'store', call POST /api/ai-operator/missions/:missionId/start instead of quickStartCreateJob; start polling GET /api/ai-operator/missions/:missionId/status; map currentStage to execution nodeStatus/report. (c) **Toggle:** Add Pipeline vs AI Operator mode in the mission plan UI (e.g. where plan is generated or in the confirm step); set plan.mode to 'operator' when selected. (d) **Execution drawer:** When mission has Operator run (e.g. artifacts from status include agentThreadId), show “Advanced view” button linking to Agent Chat with that thread (or missionId). |

---

## 6. Assumptions and clarifications

- **Two thread models:** Code uses both **ChatThread** (AgentMessage.threadId) and **ConversationThread** (threadsRoutes). The integration assumes we pick one for “thread per MissionRun” (e.g. ConversationThread via POST /api/threads) and store that id in MissionRun.agentThreadId; or we add a small wrapper that creates the right thread type and participants so GET /api/agent-messages returns messages for that mission/thread.
- **Mission table:** Backend has a **Mission** table (getOrCreateMission in `lib/mission.js`). Dashboard missions are client-only (localStorage). missionId in Operator APIs is the **dashboard mission id** (localStorage key); backend can create a Mission row for it when needed for Agent Chat context.
- **Reviewer:** Treated as UI-only for now; no backend Reviewer agent. For needs_human or approval, use UI actions; optionally add a Reviewer agent later that posts review_result.
- **Existing pipeline:** Left intact; Operator is an alternative path when mode === 'operator' and feature-flag (if any) is on.
