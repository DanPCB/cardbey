# AI Operator + Agent Chat — Verification and Review

Verification of the implementation against `AI_OPERATOR_INTEGRATION_REPORT.md`, robustness and edge-case notes, refinements, and UI recommendations.

---

## 1. Verification against report and intent

### 1.1 What matches the design

| Area | Finding |
|------|--------|
| **MissionRun model** | Prisma (sqlite + postgres) has all reported fields: `id`, `missionId`, `missionType`, `goal`, `tenantId`, `userId`, `currentStage` (default `"planning"`), `currentDraftId`, `currentJobId`, `currentGenerationRunId`, `currentStoreId`, `attempts` (0), `maxAttempts` (20), `status` (default `"running"`), `lastError`, `artifactSnapshot`, `agentThreadId`, `createdAt`, `updatedAt`. Indexes on `missionId`, `status`, `createdAt`. |
| **operatorState.js** | `loadOperatorState(missionRunId)`, `loadOperatorStateByMissionId(missionId)`, `saveOperatorState(missionRunId, patch)`, `createMissionRun(params)` implemented. Guards on empty/missing missionRunId; uses `getPrismaClient()`; returns null when `prisma.missionRun` missing. `rowToState` supplies defaults for `currentStage`, `status`, `attempts`, `maxAttempts`. |
| **tools/index.js** | All six tools present: `start_build_store`, `get_draft_by_run`, `get_draft_summary`, `poll_orchestra_job`, `publish_store`, `log_event`. `runTool(toolName, params)` throws for unknown tool name (whitelist). Imports use `../../../` from `src/ai/operator/tools/` correctly. |
| **runOperatorStep.js** | build_store flow: planning / no job → `start_build_store` → running_job; running_job → `poll_orchestra_job` → completed → checking_draft, failed → status failed; checking_draft → `get_draft_summary` → ready → awaiting_review + succeeded, failed → status failed. `maxAttempts` enforced in running_job and checking_draft; unhandled stage/type increments attempts and sets needs_human at effectiveMax. |
| **runOperatorStepWithAgents.js** | Loads state; if status !== running returns state; if no agentThreadId and userId/missionId present, creates thread via `createThreadForMission`, saves agentThreadId; then delegates to `runOperatorStep(missionRunId)`. |
| **threadForMission.js** | Creates ConversationThread + ThreadParticipant (user owner + planner, research). Uses `getPrismaClient()`; returns `{ threadId }` or null. |
| **aiOperatorRoutes.js** | POST start: requireAuth, creates thread then MissionRun with agentThreadId, kicks runOperatorStepWithAgents (fire-and-forget), returns missionRunId, status, currentStage, agentThreadId. POST step: requireAuth, loadOperatorStateByMissionId, if not running returns 200 with message; else runOperatorStepWithAgents(state.id) and return updated state. GET status: requireAuth, loadOperatorStateByMissionId, returns run + artifacts + agentThreadId. All use getTenantId(req.user) / req.user.id in start. |
| **server.js** | `app.use('/api/ai-operator', aiOperatorRoutes)` present. |
| **missionStore.ts** | `MissionArtifacts` includes `operatorRunId?: string` and `agentThreadId?: string`. |
| **operatorApi.ts** | `startOperatorMission`, `getOperatorStatus`, `runOperatorStep` (POST step) with correct URLs and auth header. |
| **ConsoleContext** | Operator path gated by `USE_AI_OPERATOR_FOR_STORE`. When true: startOperatorMission, update artifacts (operatorRunId, agentThreadId, storeId: 'pending'), init execution running, setInterval 3s: getOperatorStatus; if status running call runOperatorStep; sync artifacts and execution; clearInterval on succeeded/failed/needs_human or polls > 120. Also clears interval when execution cancelled or runId mismatch. |
| **StoreRunwayPanel** | “Advanced” section when artifacts.runtimeUrl or artifacts.agentThreadId; “Advanced view (Agent Chat)” links to `/app/threads/${artifacts.agentThreadId}`. |
| **stepHandlers** | Store report links include “Advanced view (Agent Chat)” when `mission.artifacts?.agentThreadId`, href `/app/threads/${mission.artifacts.agentThreadId}`. |

### 1.2 Discrepancies / assumptions to reconcile

- **Report path vs actual path:** Report says “src/ai/operator/operatorState.js” and “src/ai/operator/tools/index.js”. Actual paths under core are `apps/core/cardbey-core/src/ai/operator/...`. No code bug; only doc path style (relative to core).
- **POST step and auth:** Step handler does not pass `req.user` into runOperatorStepWithAgents; the step only uses persisted MissionRun state (userId/tenantId already on the run). So tenant/user are not “passed into tools” on step—they come from the run record. This is consistent with intent; recommend documenting that step is “run in request context but uses MissionRun’s userId/tenantId for tool calls.”
- **Status “latest” semantics:** `loadOperatorStateByMissionId` uses `findFirst` with `orderBy: { createdAt: 'desc' }`, so it returns the latest run for that missionId. Correct.

---

## 2. Robustness and edge cases

### 2.1 MissionRun

- **Defaults:** Prisma defaults: `currentStage = "planning"`, `status = "running"`, `attempts = 0`, `maxAttempts = 20`. operatorState `rowToState` uses `?? 'planning'`, `?? 'running'`, `?? 0`, `?? DEFAULT_MAX_ATTEMPTS`. Good.
- **maxAttempts enforcement:** runOperatorStep uses `effectiveMax = maxAttempts > 0 ? maxAttempts : MAX_ATTEMPTS_DEFAULT` and sets status to needs_human when `nextAttempts >= effectiveMax` in running_job and checking_draft, and for unhandled stage/type. Good.

### 2.2 Tools

- **runTool whitelist:** Throws `Error('Unknown operator tool: ...')` for names not in TOOL_NAMES. Safe.
- **start_build_store:** If `createBuildStoreJob` throws, runOperatorStep’s try/catch saves status failed and lastError. If result has needRun but missing jobId/draftId/generationRunId, runBuildStoreJob is not called (guarded); return value still has jobId/generationRunId. No null dereference.
- **poll_orchestra_job:** Missing or invalid jobId returns `{ status: 'not_found' }`. Task not found returns same. runOperatorStep does not treat 'not_found' as terminal; next poll would hit same. **Recommendation:** In runOperatorStep, if `job.status === 'not_found'` and we have currentJobId, either retry (attempts) or set needs_human after a few consecutive not_found (e.g. 3) to avoid infinite polling.
- **get_draft_by_run:** Returns null for missing/invalid input or draft; runOperatorStep uses `byRun?.draftId ?? null`. Safe.
- **get_draft_summary:** Missing draftId returns `{ ok: false, status: 'unknown' }`; getDraft failure returns `{ ok: false, status: 'not_found' }`. runOperatorStep only checks `summary?.status === 'ready'` or `'failed'`; other statuses (e.g. 'generating', 'not_found') fall through and attempts increment. Safe.
- **publish_store:** commitDraft can throw (e.g. terms); caught and returned as `{ ok: false, error }`. Safe.

### 2.3 aiOperatorRoutes

- **requireAuth:** All three handlers use `requireAuth`. Start handler passes userId and tenantId into createMissionRun and createThreadForMission. Step and status do not need to pass user into the step logic (state already has userId/tenantId). Good.
- **Status “latest”:** Confirmed above.
- **POST step idempotent when terminal:** If `state.status !== 'running'`, handler returns 200 with `run: state` and message “Run not in running status”. It does not call runOperatorStepWithAgents. Idempotent and safe.

### 2.4 Dashboard

- **Feature flag:** Operator path only runs when `USE_AI_OPERATOR_FOR_STORE === true`. Pipeline path unchanged when false. Good.
- **Polling termination:** Interval cleared on succeeded, failed, needs_human, timeout (polls > maxPolls), and when `m.execution?.status === 'cancelled'` or `m.execution.runId !== runId`. Good.
- **Unmount cleanup:** The interval is started inside an async IIFE and the interval id is not stored in a ref. If the user navigates away or the mission drawer closes, the interval continues until one of the stop conditions. **Recommendation:** Store the interval id in a ref (e.g. from a parent that owns the mission run) and clear it in a useEffect cleanup, or have the polling logic check a “mounted” ref before calling updateMission so updates stop after unmount (interval can still run but will no-op).

---

## 3. Refinements and cleanup

### 3.1 Typing and structure

- **Convert to TypeScript where practical:** operatorState.js, tools/index.js, runOperatorStep.js, runOperatorStepWithAgents.js, threadForMission.js, aiOperatorRoutes.js could be migrated to .ts for OperatorState, tool params/return types, and route response types. Start with operatorState and tools so runOperatorStep and routes get inferred types.
- **Discriminated unions:** Define `OperatorStatus = 'running' | 'succeeded' | 'failed' | 'needs_human'` and `OperatorStage = 'planning' | 'running_job' | 'checking_draft' | 'awaiting_review' | ...` and use them in Prisma (or in TS types only) to avoid string typos.
- **Namespace:** Keeping everything under `src/ai/operator/` is clear. Optional: `src/ai/operator/index.js` that re-exports runOperatorStep, runOperatorStepWithAgents, loadOperatorState, createMissionRun so routes import from a single entry.

### 3.2 Logging and telemetry

- **Single helper:** e.g. `logOperatorToolCall(missionRunId, toolName, durationMs, success)` in `src/ai/operator/logging.js` and call it from runOperatorStep around each runTool call (or from runTool itself when given an optional missionRunId). Log to console in dev and to AuditEvent or a dedicated OperatorEvent table in prod.
- **Metrics:** In runOperatorStep or routes, increment counters for tools_called_per_mission, failure_reasons (lastError.code), needs_human_count (e.g. for a stats endpoint or dashboard).

### 3.3 Duplication

- **Operator tools vs existing APIs:** Tools wrap createBuildStoreJob, getDraftByGenerationRunId, getDraft, orchestrator task read, commitDraft. No logic duplication; they are thin wrappers. Keeping them in the operator layer preserves a single place to add logging/guards and keeps the operator independent of HTTP.
- **artifactSnapshot vs dashboard artifacts:** MissionRun.artifactSnapshot is a server-side cache of jobId/draftId/storeId/generationRunId; dashboard artifacts are the client’s view and are synced from GET status. Duplication is intentional (server source of truth vs client display). Optional: document that artifactSnapshot is the canonical operator output and dashboard artifacts are a mirror.

### 3.4 Wire plan.mode === 'operator'

- In the component that builds or confirms the plan, set `plan.mode` from a UI choice (e.g. `'operator' | 'pipeline'`). In ConsoleContext.startExecution, use:
  - `if (plan.type === 'store' && (plan.mode === 'operator' || USE_AI_OPERATOR_FOR_STORE) && !mission.artifacts?.storeId) { ... operator path ... }`
  - So either the explicit mode or the flag enables the operator. Once the toggle exists, you can default plan.mode to 'operator' for new store missions and keep USE_AI_OPERATOR_FOR_STORE as a kill switch.

### 3.5 Generalize for other mission types

- runOperatorStep currently branches only on `missionType === 'build_store'`. To add e.g. campaign or quote:
  - Add a case `if (missionType === 'campaign') { ... }` with its own stages and tools (or reuse a shared “run one tool from registry” helper).
  - Register new tools in tools/index.js (e.g. validate_campaign_scope, create_campaign_from_plan) and add stage transitions in runOperatorStep.
  - Keep MissionRun.currentStage and status generic so new types can define their own stages.

---

## 4. UI re-organization recommendations

### 4.1 Mode toggle and execution drawer

- **Current state:** There is no visible “Pipeline vs AI Operator” toggle; only `USE_AI_OPERATOR_FOR_STORE` in code. Plan has `mode: PlanMode` in planGenerator but it is not set from the mission UI.
- **Recommendation:**
  - Where the plan is generated or confirmed (e.g. plan step or “Confirm & Run” area), add a control: “Run with: **AI Operator** (recommended) | Pipeline.” Persist choice in `mission.plan.mode` (or mission.input / a dedicated mission field).
  - In ConsoleContext.startExecution, branch on `plan.mode === 'operator'` (or fallback to USE_AI_OPERATOR_FOR_STORE) so Operator is used when the user chose it (or when defaulting to operator).

### 4.2 Make AI Operator the default

- When creating or generating a plan for a store mission, set `plan.mode = 'operator'` by default (e.g. in the code path that calls generatePlan or that builds the plan before execution). Keep Pipeline as the alternative when the user selects “Pipeline” in the toggle.
- Optionally set `USE_AI_OPERATOR_FOR_STORE = true` so that even if plan.mode is not set, store missions still use the operator until the UI sets plan.mode explicitly.

### 4.3 Execution drawer content

- **Show mode:** In the drawer that shows execution progress, display a line like “Mode: AI Operator” or “Mode: Pipeline” (from `mission.plan?.mode` or from presence of `mission.artifacts?.operatorRunId`).
- **Show stages:** For Operator runs, map `mission.artifacts` / status polling to a small list of stages (e.g. “Started” → “Building store” → “Checking draft” → “Ready”) so the user sees progress without relying only on the DAG step names. You can derive the label from the last known currentStage or from a small map (planning → “Starting”, running_job → “Building store”, checking_draft → “Checking draft”, awaiting_review/succeeded → “Ready”).
- **Advanced view link:** Already present when `artifacts.agentThreadId` is set (StoreRunwayPanel and stepHandlers). Ensure the execution drawer (or the same mission summary that shows report links) also shows “Advanced view (Agent Chat)” when `artifacts.agentThreadId` is present, using the same href `/app/threads/${artifacts.agentThreadId}`.

### 4.4 Route for /app/threads/:threadId

- The “Advanced view (Agent Chat)” link targets `/app/threads/:threadId`. If the dashboard does not yet have this route:
  - Add a route (e.g. in the same router as the console/app) for `/app/threads/:threadId` (or `/console/threads/:threadId`).
  - The page can load the thread by GET /api/threads/:id (if available) and then render the existing Agent Chat view (or a dedicated “Thread conversation” view) keyed by threadId or by the thread’s missionId. If Agent Chat currently works by missionId, pass thread.missionId to the Agent Chat component and optionally highlight that it’s the “Operator thread” for that mission.

---

## 5. Concrete code-level suggestions

### 5.1 runOperatorStep — handle poll “not_found”

After calling poll_orchestra_job in the running_job block, if `job.status === 'not_found'`:

- Increment attempts; if attempts >= effectiveMax, set status to needs_human with lastError `{ code: 'JOB_NOT_FOUND', message: 'Orchestra job not found' }`.
- Otherwise only increment attempts and return (do not advance stage). Optionally track consecutive not_found count and fail fast after 3.

### 5.2 Dashboard polling — cleanup on unmount

- In ConsoleContext (or in a custom hook used by the component that starts the operator), store the interval id in a ref, e.g. `operatorPollRef.current = setInterval(...)`. In a useEffect that runs when missionId/runId for the operator run is set, return a cleanup that clears `operatorPollRef.current`. If the interval is started from a callback that doesn’t have access to a ref, pass a ref from the provider (e.g. `operatorPollingRef`) and clear it in the provider’s useEffect when activeMissionId or the run’s status changes to a terminal state.

### 5.3 aiOperatorRoutes — document step semantics

- In a comment above POST step, add: “Runs one step for the latest run of this mission. Uses MissionRun’s userId/tenantId for tool calls; does not pass req.user into the step runner.”

### 5.4 operatorState — allow patch to clear lastError

- If the report or product wants to “retry” by resetting lastError, ensure saveOperatorState allows `lastError: null` (it’s in the allowed list). Currently patch can set lastError to null; no change needed.

### 5.5 plan.mode in startExecution

- Replace or augment the condition:
  - From: `if (USE_AI_OPERATOR_FOR_STORE) {`
  - To: `const useOperator = plan.mode === 'operator' || (plan.type === 'store' && USE_AI_OPERATOR_FOR_STORE); if (useOperator && plan.type === 'store' && !mission.artifacts?.storeId) {`
  - So either plan.mode === 'operator' or the flag enables the operator path for store missions.

### 5.6 Optional patch: handle job status 'not_found' in runOperatorStep.js

In the `running_job` block, after `const job = await runTool('poll_orchestra_job', { jobId: currentJobId });` add:

```js
if (job.status === 'not_found') {
  const nextAttempts = (state.attempts ?? 0) + 1;
  if (nextAttempts >= effectiveMax) {
    await saveOperatorState(missionRunId, {
      attempts: nextAttempts,
      status: 'needs_human',
      lastError: { code: 'JOB_NOT_FOUND', message: 'Orchestra job not found' },
    });
  } else {
    await saveOperatorState(missionRunId, { attempts: nextAttempts });
  }
  return loadOperatorState(missionRunId);
}
```

Place this block before the existing `if (job.status === 'completed' || job.success)` so that not_found is handled and does not fall through to “still running.”

---

## 6. Summary

- **Implementation vs report:** Core, routes, and dashboard behavior match the report. Only minor doc path and “tenant/user passed into tools” semantics are clarified.
- **Robustness:** Defaults and maxAttempts are enforced. Tools and routes handle nulls and errors; poll “not_found” could be turned into a terminal or limited-retry case. Step when not running is idempotent.
- **Gaps:** Polling has no unmount cleanup. No route yet for `/app/threads/:threadId`. plan.mode is not yet set from UI or used in startExecution.
- **Refinements:** Add logging/telemetry, optional TS migration and discriminated unions, and a single condition (plan.mode === 'operator' || USE_AI_OPERATOR_FOR_STORE) for the operator path. Generalize runOperatorStep for other mission types by adding branches and tools.
- **UI:** Add Pipeline vs AI Operator toggle, default store missions to operator, show mode and stages in the execution drawer, and add a route for `/app/threads/:threadId` so “Advanced view (Agent Chat)” works.
