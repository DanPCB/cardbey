# AI Operator Architecture — Cardbey

Single AI Operator for missions (starting with build_store). Audit of current pipeline, tool candidates, state model, and implementation plan.

**See also:** [AI_OPERATOR_AGENT_CHAT_INTEGRATION.md](./AI_OPERATOR_AGENT_CHAT_INTEGRATION.md) for merging the Operator with Agent Chat (Planner/Research/Reviewer) and the Mission Console toggle.

---

## 1. Current mission/pipeline implementation

### 1.1 Mission models and execution engine

| Concept | Location | Notes |
|--------|----------|--------|
| **Mission** | `apps/dashboard/.../missions/missionStore.ts` | Client-only type: `id`, `title`, `status`, `plan`, `execution`, `report`, `artifacts`, `input`. Persisted in **localStorage** (`cardbey.console.missions.v1`). No backend Mission table. |
| **MissionExecution** | Same file | `status`, `nodeStatus` (step id → pending/ready/running/completed/failed), `events`, `runId`, `reportPatch`. |
| **MissionArtifacts** | Same file | `storeId`, `draftId`, `draftStoreId`, `jobId`, `generationRunId`, `runtimeUrl`; campaign: `planId`, `campaignId`, `channels`, etc. |
| **Pipeline / DAG executor** | `apps/dashboard/.../missions/dagExecutor.ts` | `runAll(plan, missionId, updateMission, options)` runs steps in order; for each runnable step calls `runStepHandler({ mission, stepId, ... })` then updates `nodeStatus` and `events`. No backend loop; all in browser. |
| **Step handlers** | `apps/dashboard/.../missions/stepHandlers.ts` | Dispatches by `plan.type` + `stepId`. Store: `validate-context`, `execute-tasks`, `report`. Campaign: same ids; campaign_monitor: `fetch-metrics`, etc. |

**Job/task entities (backend):**

| Entity | Where | Notes |
|--------|--------|------|
| **OrchestratorTask** | Core Prisma (referenced in `miRoutes.js`, `orchestraBuildStore.js`, `transitionService.js`) | Backend job row: `id` (= jobId), `tenantId`, `userId`, `entryPoint` (e.g. `build_store`), `status` (queued → running → completed/failed), `request` (JSON), `result` (JSON). Created by POST /api/mi/orchestra/start. |
| **DraftStore** | Core Prisma | Draft row: `id` (= draftId), `generationRunId`, `status` (generating | ready | failed | committed), etc. Created in orchestra/start when goal is build_store. |
| **WorkflowRun** | `transitionService.js` | Optional sync for store_creation; not required for Operator. |

### 1.2 How “Create an online store” mission executes today

**Path A — Mission UI (store plan with artifacts already set):**

1. User confirms plan; `startExecution(missionId)` in `ConsoleContext.tsx` runs.
2. If store plan and **no** `artifacts.storeId`: build payload from `mission.input`, call **quickStartCreateJob** (single source of truth), then persist `storeId`, `jobId`, `generationRunId`, `runtimeUrl` into `mission.artifacts` and call `runAll(plan, missionId, updateMission, ...)`.
3. **quickStartCreateJob** (in `lib/quickStart.ts`): `ensureAuth()` → **POST /api/mi/orchestra/start** with `goal: 'build_store'`, `rawInput`, `businessName`, `businessType`, `generationRunId` (client-generated UUID), etc. Response: `jobId`, `storeId`, `generationRunId`. No polling inside quickStart when `skipNavigate: true`; caller (mission) is responsible for polling.
4. **runAll** runs steps in order:
   - **validate-context**: If no `jobId`, Phase 0 path calls POST /api/draft-store (create) and stores `draftStoreId`/`draftId`. If `jobId` exists, calls **resolveDraftIdForMission** (job → draftId or generationRunId → GET /api/stores/temp/draft), then **fetchStoreDraft(draftId)** (GET /api/store-draft/:id or draft-store). Fails if draft not ready or catalog empty.
   - **execute-tasks**: If Phase 0 (`draftStoreId`, no jobId), POST draft-store/:id/generate then poll GET draft-store/:id/summary until ready/failed. If jobId present: **poll getOrchestraJob(jobId)** until terminal; on success resolve storeId/draftId from job, update artifacts, fetch draft once for summary.
   - **report**: Build report patch (links: Open Draft Review, Open Preview, runtime URL).

**Path B — Backend (orchestra/start):**

1. **POST /api/mi/orchestra/start** (`miRoutes.js` handleOrchestraStart): Validates goal, tenant; creates **OrchestratorTask** (queued, entryPoint build_store); resolves `generationRunId` (body or job.id); for build_store may create **DraftStore** via createDraftStoreForUser and enqueue **runBuildStoreJob** (or return existing draft).
2. **runBuildStoreJob** (`orchestraBuildStore.js`): Async; transitions task to running, loads DraftStore, calls **generateDraft** (draftStoreService), then transitions task to completed/failed. Writes result (storeId, draftId, etc.) into task.
3. **GET /api/mi/orchestra/job/:jobId** (`miRoutes.js`): Returns task as flat job contract (status, inputsJson, resultJson, etc.). Dashboard normalizes to `jobResp.job` in `orchestraJobApi.ts`.

**ID flow:**

- **jobId** = OrchestratorTask.id (from orchestra/start response).
- **generationRunId** = client UUID or job.id; stored in task.request and DraftStore.generationRunId.
- **draftId** = DraftStore.id; from job resultJson/inputsJson or from **getDraftIdByGenerationRunId** (GET /api/stores/temp/draft?generationRunId=...).
- **storeId** = from job result/input or Business/store created on commit.

**Retries and stale IDs:**

- **Retry** (ConsoleContext `retryExecution`): For store, calls **quickStartCreateJob** again (new job, new generationRunId), updates **artifacts** with new `jobId`, `generationRunId`, `storeId`, then builds new execution and runs **runAll**. So each retry gets fresh job/draft; no stale IDs if UI uses updated mission.
- Risk: if mission is not re-read after retry, old jobId could be polled; mitigated by updating artifacts before runAll and by runId guard in runAll.

---

## 2. Reusable tool candidates (Operator tool registry)

Wrap existing backend/frontend calls as tools; no behavior change.

| Tool name | Backing implementation | Proposed TypeScript signature |
|-----------|-------------------------|-------------------------------|
| **start_build_store** | POST /api/mi/orchestra/start (goal build_store) + create DraftStore when needed | `start_build_store(params: { businessName?: string; businessType?: string; includeImages?: boolean; generationRunId?: string; storeId?: string; tenantId: string }): Promise<{ jobId: string; storeId?: string; draftId?: string; generationRunId: string }>` |
| **get_draft_by_run** | GET /api/stores/temp/draft?generationRunId= (or backend getDraftByGenerationRunId) | `get_draft_by_run(params: { generationRunId: string }): Promise<{ draftId?: string; status?: string; storeId?: string } \| null>` |
| **get_draft_summary** | GET /api/draft-store/:draftId/summary | `get_draft_summary(params: { draftId: string }): Promise<{ ok: boolean; status: string; productCount?: number; categoryCount?: number }>` |
| **poll_orchestra_job** | GET /api/mi/orchestra/job/:jobId (normalize to job shape) | `poll_orchestra_job(params: { jobId: string }): Promise<{ status: string; storeId?: string; draftId?: string; success?: boolean; lastError?: string }>` |
| **publish_store** | POST /api/draft-store/:draftId/commit (or equivalent store publish) | `publish_store(params: { draftId: string }): Promise<{ ok: boolean; storeId?: string; error?: string }>` |
| **log_event** | Append to mission/run event log or AuditEvent | `log_event(params: { missionRunId: string; level: 'info' \| 'warn' \| 'error'; message: string; data?: object }): Promise<void>` |

**Assumptions:** send_email / send_notification not present in scanned code; add as stub or when implemented. Tools run server-side (Operator lives in core); so start_build_store and poll_orchestra_job call internal services or same HTTP endpoints with service auth.

---

## 3. Existing mission state model and Operator state

- **Backend:** There is **no** Mission or MissionRun table in the codebase. Missions live in the dashboard’s localStorage only.
- **OrchestratorTask** is the only run-like entity: one row per “job” (build_store run). It has status, request, result, but no missionId, no currentStage, no attempts.

**Proposal — new Operator state (persistent):**

Add a **MissionRun** (or **OperatorState**) model in Core so the Operator has a single place to read/write per-mission run state, independent of the dashboard’s in-memory mission.

Suggested shape (Prisma or TypeScript type):

```ts
// OperatorState or MissionRun
{
  id: string;
  missionId: string;        // from dashboard (or future backend mission id)
  missionType: string;      // 'build_store' | ...
  goal: string;             // text goal
  currentStage: string;     // 'planning' | 'running_job' | 'checking_draft' | 'awaiting_review' | 'publishing' | ...
  currentDraftId?: string;
  currentJobId?: string;
  currentGenerationRunId?: string;
  currentStoreId?: string;
  attempts: number;
  maxAttempts: number;
  status: 'running' | 'succeeded' | 'failed' | 'needs_human';
  lastError?: object;       // JSON
  artifactSnapshot?: object;
  createdAt: Date;
  updatedAt: Date;
}
```

If Prisma is in a different repo or schema path, add this model where other Core entities (OrchestratorTask, DraftStore) live. If no Prisma in repo, use a TypeScript type and persist via existing DB client (e.g. new table with same fields).

---

## 4. Where to implement runOperatorStep

**Suggested folder:** `apps/core/cardbey-core/src/ai/operator/` (or `src/server/ai/operator` if that pattern exists).

**Files to add:**

- `tools/index.ts` — Tool registry: `Record<string, (params: unknown) => Promise<unknown>>` and typed wrappers calling existing services/APIs.
- `operatorState.ts` — Load/save Operator state (MissionRun row or in-memory + optional DB).
- `runOperatorStep.ts` — Single function: `runOperatorStep(missionRunId: string): Promise<OperatorState>`.

**Sketch runOperatorStep(missionRunId: string):**

```ts
// Pseudocode
async function runOperatorStep(missionRunId: string): Promise<OperatorState> {
  const state = await loadOperatorState(missionRunId);
  if (!state || state.status !== 'running') return state;

  const { missionType, currentStage, currentJobId, currentDraftId, currentGenerationRunId } = state;
  const tools = getToolRegistry();

  // Rule-based policy for build_store (no LLM initially)
  if (missionType === 'build_store') {
    if (currentStage === 'planning' || !currentJobId) {
      const result = await tools.start_build_store({
        businessName: state.goal?.slice(0, 100),
        businessType: '',
        tenantId: state.tenantId,
        generationRunId: state.currentGenerationRunId || crypto.randomUUID(),
      });
      await updateState(missionRunId, {
        currentStage: 'running_job',
        currentJobId: result.jobId,
        currentGenerationRunId: result.generationRunId,
        currentDraftId: result.draftId ?? undefined,
        currentStoreId: result.storeId,
      });
      return loadOperatorState(missionRunId);
    }

    if (currentStage === 'running_job' && currentJobId) {
      const job = await tools.poll_orchestra_job({ jobId: currentJobId });
      if (job.status === 'COMPLETED' || job.status === 'SUCCESS' || job.status === 'READY_FOR_REVIEW') {
        const draftId = job.draftId ?? (await tools.get_draft_by_run({ generationRunId: state.currentGenerationRunId }))?.draftId;
        await updateState(missionRunId, {
          currentStage: 'checking_draft',
          currentDraftId: draftId ?? state.currentDraftId,
          currentStoreId: job.storeId ?? state.currentStoreId,
        });
      } else if (['FAILED', 'CANCELED'].includes(job.status)) {
        await updateState(missionRunId, { status: 'failed', lastError: { message: job.lastError } });
      }
      return loadOperatorState(missionRunId);
    }

    if (currentStage === 'checking_draft' && state.currentDraftId) {
      const summary = await tools.get_draft_summary({ draftId: state.currentDraftId });
      if (summary?.status === 'ready') {
        await updateState(missionRunId, { currentStage: 'awaiting_review', status: 'succeeded' });
      } else if (summary?.status === 'failed') {
        await updateState(missionRunId, { status: 'failed', lastError: { message: 'Draft failed' } });
      }
      return loadOperatorState(missionRunId);
    }
  }

  // Max iterations / timeout
  state.attempts++;
  if (state.attempts >= state.maxAttempts) {
    await updateState(missionRunId, { status: 'needs_human', lastError: { code: 'MAX_ATTEMPTS' } });
  }
  return loadOperatorState(missionRunId);
}
```

Use existing services: create job via same logic as handleOrchestraStart (or call internal helper), poll via getOrchestraJob equivalent, get draft by run via getDraftByGenerationRunId (draftStoreService).

---

## 5. API and frontend touch points

**Current endpoints used by console for store mission:**

- **POST /api/mi/orchestra/start** — create job (and optionally draft); returns jobId, storeId, generationRunId.
- **GET /api/mi/orchestra/job/:jobId** — job status; dashboard normalizes to `jobResp.job`.
- **GET /api/draft-store/:draftId/summary** — draft status and counts.
- **GET /api/store-draft/:id** (or GET /api/stores/temp/draft?generationRunId=) — draft by id or by generationRunId.
- **POST /api/draft-store** (create), **POST /api/draft-store/:id/generate** — Phase 0 path.

**Proposed new endpoints (Operator):**

- **POST /api/ai-operator/missions/:missionId/start** — Create MissionRun/OperatorState (missionId from body or path), set status running, enqueue or run first `runOperatorStep`, return run id and initial state.
- **GET /api/ai-operator/missions/:missionId/status** — Return current Operator state (currentStage, progress, artifacts: draftId, jobId, storeId, status).

**Frontend adaptation:**

- For missions that are “Operator-driven” (e.g. build_store when feature-flag is on), console:
  - Calls **POST .../start** instead of (or in addition to) quickStartCreateJob + runAll.
  - Polls **GET .../status** and maps `currentStage` to existing step labels (e.g. running_job → “Generate store assets”, checking_draft → “Validate store context”, awaiting_review → “Store report”) so the same Execution panel can show progress.
- Map Operator `status` to mission status: succeeded → completed, failed → failed, needs_human → running (with banner “Needs your input”) or a dedicated needs_human state in the UI.

---

## 6. Implementation checklist (incremental)

1. **Tool registry** — `apps/core/cardbey-core/src/ai/operator/tools/index.ts`: define and implement start_build_store, get_draft_by_run, get_draft_summary, poll_orchestra_job, publish_store, log_event (wrapping existing code).
2. **Operator state** — Add Prisma model MissionRun (or OperatorState) and migration; or TypeScript type + repository in same folder.
3. **runOperatorStep** — Implement in `apps/core/cardbey-core/src/ai/operator/runOperatorStep.ts` with rule-based build_store policy, max iterations, timeouts.
4. **Routes** — New router under `/api/ai-operator` (e.g. `apps/core/cardbey-core/src/routes/aiOperatorRoutes.js`): POST missions/:missionId/start, GET missions/:missionId/status.
5. **Console** — Feature-flag: for store missions, call Operator start and poll status; map state to existing mission artifacts and execution nodeStatus so current UI keeps working.
6. **Logging/metrics** — Log tools called per mission, failure reasons, needs_human count.

**Assumptions:**

- missionId in Operator APIs is the same id the dashboard uses (localStorage mission id); no backend Mission table yet.
- Tenant/auth: Operator runs in request context (requireAuth) and passes tenantId/userId into tools that need it.
- Existing pipeline (runAll, stepHandlers, quickStartCreateJob) remains unchanged; Operator is an alternative path behind a flag.

---

## 7. Concrete file locations and function names

| Item | Path / name |
|------|-------------|
| Tool registry (types + map) | `apps/core/cardbey-core/src/ai/operator/tools/index.ts` — export `ToolRegistry`, `ToolName`, `runTool(name, params)` |
| Tool implementations | Same file or `tools/startBuildStore.ts`, `tools/pollOrchestraJob.ts`, etc., then register in `index.ts` |
| Operator state type | `apps/core/cardbey-core/src/ai/operator/operatorState.ts` — `OperatorState` type, `loadOperatorState(missionRunId)`, `saveOperatorState(missionRunId, patch)` |
| Prisma model | `apps/core/cardbey-core/prisma/schema.prisma` — add model `MissionRun` with fields from §3; run `npx prisma migrate dev --name add_mission_run` |
| Step runner | `apps/core/cardbey-core/src/ai/operator/runOperatorStep.ts` — export `runOperatorStep(missionRunId: string): Promise<OperatorState>` |
| API routes | `apps/core/cardbey-core/src/routes/aiOperatorRoutes.js` — `POST /missions/:missionId/start`, `GET /missions/:missionId/status`; mount in `server.js` as `app.use('/api/ai-operator', aiOperatorRoutes)` |
| Mission start handler | In aiOperatorRoutes: `createMissionRun(missionId, missionType, goal)` → insert MissionRun, then call `runOperatorStep(id)` (sync or queue), return `{ missionRunId, status, currentStage }` |
| Status handler | In aiOperatorRoutes: `getMissionRunByMissionId(missionId)` → return latest run state (currentStage, progress, artifacts) |
| Console integration | `apps/dashboard/.../ConsoleContext.tsx` or mission start path: when `useOperatorForStoreMission` (or similar flag) and plan is store, call `POST /api/ai-operator/missions/:missionId/start` and poll `GET /api/ai-operator/missions/:missionId/status`; map `currentStage` to step labels in Execution UI |
