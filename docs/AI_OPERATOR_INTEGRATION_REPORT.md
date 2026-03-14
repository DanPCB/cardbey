# AI Operator + Agent Chat Integration — Implementation Report

Completed implementation of the checklist from `AI_OPERATOR_AGENT_CHAT_INTEGRATION.md`. Summary of what was done and how to run it.

---

## 1. Checklist status

| # | Task | Status | Location |
|---|------|--------|----------|
| 1 | MissionRun model + operatorState repo helpers | Done | Prisma schema (sqlite + postgres), `src/ai/operator/operatorState.js` |
| 2 | Operator tool registry | Done | `src/ai/operator/tools/index.js` |
| 3 | Rule-based runOperatorStep (build_store) | Done | `src/ai/operator/runOperatorStep.js` |
| 4 | Thread per MissionRun + runOperatorStepWithAgents | Done | `src/ai/operator/threadForMission.js`, `runOperatorStepWithAgents.js`, start handler creates thread |
| 5 | Wire aiOperatorRoutes + Console + Advanced view | Done | `src/routes/aiOperatorRoutes.js`, server mount, ConsoleContext branch, StoreRunwayPanel + stepHandlers link |

---

## 2. What was implemented

### 2.1 Backend (core)

- **MissionRun model** (Prisma)
  - Added to `prisma/sqlite/schema.prisma` and `prisma/postgres/schema.prisma`.
  - Fields: `id`, `missionId`, `missionType`, `goal`, `tenantId`, `userId`, `currentStage`, `currentDraftId`, `currentJobId`, `currentGenerationRunId`, `currentStoreId`, `attempts`, `maxAttempts`, `status`, `lastError`, `artifactSnapshot`, `agentThreadId`, `createdAt`, `updatedAt`.
  - **Note (Windows EPERM):** Run `npx prisma generate` when **no process** is using the Prisma client. If you see `EPERM: operation not permitted, rename ... query_engine-windows.dll.node.tmp... -> ... query_engine-windows.dll.node`: (1) Stop the cardbey-core server and any other Node processes. (2) Close the IDE or run generate from a **new** PowerShell window (not the IDE terminal). (3) Retry. The DLL is locked by whatever is currently loading the client.

- **operatorState.js**
  - `loadOperatorState(missionRunId)`, `loadOperatorStateByMissionId(missionId)`, `saveOperatorState(missionRunId, patch)`, `createMissionRun(params)`.
  - Uses `getPrismaClient()` from `db/prisma.js`; if `prisma.missionRun` is missing (client not regenerated), create/load return null.

- **tools/index.js**
  - Registry: `start_build_store`, `get_draft_by_run`, `get_draft_summary`, `poll_orchestra_job`, `publish_store`, `log_event`.
  - Wraps `createBuildStoreJob` + `runBuildStoreJob`, `getDraftByGenerationRunId`, `getDraft`, orchestrator task lookup, `commitDraft` (stub-friendly), and console log for `log_event`.
  - `runTool(toolName, params)` with whitelist check.

- **runOperatorStep.js**
  - Rule-based flow for `build_store`: planning → `start_build_store`; running_job → `poll_orchestra_job`; checking_draft → `get_draft_summary`. Sets status to succeeded / failed / needs_human and enforces `maxAttempts`.

- **threadForMission.js**
  - `createThreadForMission({ missionId, userId, tenantId, title })` creates a `ConversationThread` + `ThreadParticipant` (user + planner, research). Used when starting an Operator run.

- **runOperatorStepWithAgents.js**
  - Ensures MissionRun has `agentThreadId` (creates thread if missing), then calls `runOperatorStep(missionRunId)`. No LLM tool choice in this phase.

- **aiOperatorRoutes.js**
  - `POST /api/ai-operator/missions/:missionId/start`: creates MissionRun, creates ConversationThread and sets `agentThreadId`, kicks `runOperatorStepWithAgents` in the background, returns `{ missionRunId, status, currentStage, agentThreadId }`.
  - `POST /api/ai-operator/missions/:missionId/step`: runs one `runOperatorStepWithAgents` for the latest run of this mission (if status is still running); returns updated state (same shape as status). Used by the dashboard each poll to advance the run.
  - `GET /api/ai-operator/missions/:missionId/status`: returns latest MissionRun for that mission with `currentStage`, `status`, `artifacts`, `agentThreadId`.
  - All use `requireAuth`; tenant/user from request.

- **server.js**
  - Mounted: `app.use('/api/ai-operator', aiOperatorRoutes)`.

### 2.2 Dashboard

- **missionStore.ts**
  - `MissionArtifacts` extended with `operatorRunId?: string` and `agentThreadId?: string`.

- **lib/operatorApi.ts**
  - `startOperatorMission(missionId, { goal, missionType })` → POST start.
  - `getOperatorStatus(missionId)` → GET status.

- **ConsoleContext.tsx**
  - `USE_AI_OPERATOR_FOR_STORE = false` (feature flag). When set to `true` and plan is store with no artifacts:
    - Calls `startOperatorMission` instead of `quickStartCreateJob`.
    - Updates artifacts with `operatorRunId`, `agentThreadId`, and placeholder `storeId: 'pending'`.
    - Inits execution as running and starts a 3s polling loop. On each poll: GET status; if status is still `running`, calls `runOperatorStep(missionId)` (POST step) to advance one step, then uses the step response (or status) to sync artifacts and execution.
    - Syncs `artifacts` (jobId, draftId, storeId, generationRunId, agentThreadId, runtimeUrl) and execution status (succeeded → completed, failed/needs_human → failed or running with message). Stops polling when status is succeeded/failed/needs_human or after 120 polls.

- **StoreRunwayPanel.tsx**
  - When `artifacts.agentThreadId` or `artifacts.runtimeUrl` is set, “Advanced” section shows:
    - “Open pipeline runtime (debug)” if `runtimeUrl` is set.
    - “Advanced view (Agent Chat)” linking to `/app/threads/${artifacts.agentThreadId}` if `agentThreadId` is set.

- **stepHandlers.ts**
  - In store report links, added “Advanced view (Agent Chat)” when `mission.artifacts.agentThreadId` is set, href `/app/threads/${mission.artifacts.agentThreadId}`.

---

## 3. How to run and test

1. **Regenerate Prisma (when DB client is not in use)**
   - From `apps/core/cardbey-core`:
     - SQLite: `npx prisma generate --schema prisma/sqlite/schema.prisma`
     - Postgres: `npx prisma generate --schema prisma/postgres/schema.prisma`
   - If using SQLite, ensure DB has the new table: `npx prisma db push --schema prisma/sqlite/schema.prisma` (or run migrations for postgres).

2. **Enable Operator path in the dashboard**
   - In `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleContext.tsx`, set:
     - `const USE_AI_OPERATOR_FOR_STORE = true;`
   - Restart the dashboard. New store missions (with form input and “Confirm & Run”) will use `POST /api/ai-operator/missions/:missionId/start` and poll status instead of quickStart + DAG.

3. **Manual API test**
   - `POST /api/ai-operator/missions/{missionId}/start` with body `{ "goal": "Build my store", "missionType": "build_store" }` (Bearer auth).
   - `GET /api/ai-operator/missions/{missionId}/status` to inspect `currentStage`, `status`, `artifacts`, `agentThreadId`.

4. **Advanced view (Agent Chat)**
   - The link “Advanced view (Agent Chat)” points to `/app/threads/:threadId`. The dashboard may not have a route for that path yet; add a page that loads the conversation thread (e.g. by `threadId` or by `missionId`) and shows Agent Chat for that thread when you are ready.

---

## 4. Assumptions and limitations

- **Prisma client:** Both `db/prisma.js` (getPrismaClient) and `lib/prisma.js` exist; operator uses getPrismaClient. After adding MissionRun, generate from the schema that includes MissionRun so the client has `missionRun` delegate.
- **Thread model:** Operator creates a **ConversationThread** and stores its id in `MissionRun.agentThreadId`. Agent messages are still keyed by `missionId` in GET /api/agent-messages; the thread id is used for “Advanced view” and future thread-scoped UI.
- **Step advancement:** POST start runs `runOperatorStepWithAgents` once (fire-and-forget). The dashboard polls GET status every 3s and, when status is still `running`, calls **POST /api/ai-operator/missions/:missionId/step** to run one more step, then uses the response to update UI. So the run advances (planning → running_job → checking_draft → succeeded/failed) as the client polls and triggers steps.
- **publish_store:** Calls `commitDraft`; in production, commit may require auth and terms; the tool returns `{ ok: false, error }` on failure.
- **Pipeline/Operator toggle in UI:** The plan mode (`pipeline` | `operator`) is not yet selected in the mission UI; only the constant `USE_AI_OPERATOR_FOR_STORE` is used. To let users choose, add a control (e.g. in the confirm step or plan view) that sets `plan.mode` to `'operator'` and have `startExecution` branch on `plan.mode === 'operator'` instead of (or in addition to) `USE_AI_OPERATOR_FOR_STORE`.

---

## 5. Files touched (summary)

| Area | Files |
|------|--------|
| Prisma | `prisma/sqlite/schema.prisma`, `prisma/postgres/schema.prisma` (MissionRun model) |
| Operator | `src/ai/operator/operatorState.js`, `src/ai/operator/tools/index.js`, `src/ai/operator/runOperatorStep.js`, `src/ai/operator/threadForMission.js`, `src/ai/operator/runOperatorStepWithAgents.js` |
| Routes | `src/routes/aiOperatorRoutes.js`, `src/server.js` (import + mount) |
| Dashboard | `src/app/console/missions/missionStore.ts` (artifacts), `src/lib/operatorApi.ts` (new), `src/app/console/ConsoleContext.tsx` (operator branch + polling), `src/app/console/missions/StoreRunwayPanel.tsx` (Advanced view), `src/app/console/missions/stepHandlers.ts` (report link) |

---

## 6. Suggested next steps

1. **Route for Agent Chat by thread:** Add a dashboard route (e.g. `/app/threads/:threadId` or `/console/agent-chat?threadId=`) that renders Agent Chat for that thread (and/or missionId).
2. **Pipeline vs Operator in UI:** Add a toggle or plan-mode selector so the user can choose “Pipeline” vs “AI Operator” and have `startExecution` use the operator path when `plan.mode === 'operator'`.
3. **Logging/metrics (optional):** Log tool calls per mission, failure reasons, and needs_human count (e.g. in runOperatorStep or in the route handler).
