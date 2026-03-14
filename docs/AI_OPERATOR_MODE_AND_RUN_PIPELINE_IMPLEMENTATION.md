# AI Operator Default Mode + run_pipeline Tool — Implementation Summary

This document summarizes the code changes that make **AI Operator (with Agent Chat)** the default mode in the Mission Console, keep **Pipeline** as an explicit alternative, and expose **run_pipeline(planId/missionId)** to the Operator.

---

## 1. Mode toggle and default

- **plan.mode:** Already defined in `planGenerator.ts` as `PlanMode = 'pipeline' | 'operator'` and on `Plan`.
- **Default for new missions:** `generatePlan({ text, mode })` now treats missing `mode` as `'operator'` (`effectiveMode = mode ?? 'operator'`). Exported `DEFAULT_PLAN_MODE = 'operator'` for use where plans are created.
- **Mission Console UI:** The component that renders the "Mode: Pipeline / AI Operator" control above "Describe what you want to run…" was not found in this repo (it may live in another app or not yet be implemented). **Action for you:** Wherever the plan is created (e.g. in the composer or mission detail), call `generatePlan({ text, mode })` with `mode` from the toggle state, and default that toggle to `'operator'`. Ensure `createMission` / `updateMission` receive and persist `plan` (with `plan.mode`) and optionally `mission.mode`.

---

## 2. startExecution wired to plan.mode

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ConsoleContext.tsx`

- **useOperator condition:**  
  `useOperatorForPlan(plan) = (plan.mode ?? 'operator') === 'operator' || (plan.type === 'store' && USE_AI_OPERATOR_FOR_STORE)`  
  So: default (no mode) → operator; explicit `plan.mode === 'pipeline'` → pipeline; kill switch `USE_AI_OPERATOR_FOR_STORE` still forces operator for store when true.
- **Branching:** For store missions without artifacts, the code now uses **useOperatorForPlan(plan)** instead of **USE_AI_OPERATOR_FOR_STORE** only:
  - If `useOperatorForPlan(plan)` → AI Operator path (startOperatorMission + polling).
  - Else → existing Pipeline path (quickStartCreateJob + runAll DAG).
- **Kill switch:** `USE_AI_OPERATOR_FOR_STORE` remains; when true, store missions use the Operator path even if `plan.mode === 'pipeline'`.

---

## 3. run_pipeline tool and runOperatorStep

**Files:**  
`apps/core/cardbey-core/src/ai/operator/tools/index.js`  
`apps/core/cardbey-core/src/ai/operator/runOperatorStep.js`  
`apps/core/cardbey-core/src/ai/operator/operatorState.js`  
`apps/core/cardbey-core/prisma/sqlite/schema.prisma`  
`apps/core/cardbey-core/src/routes/aiOperatorRoutes.js`

- **Tool `run_pipeline`:**  
  - Signature: `run_pipeline(params: { planId?: string, missionId?: string, missionRunId?: string })`  
  - Returns: `Promise<{ status: 'succeeded' | 'failed'; artifacts?: object; logsSummary?: object }>`.  
  - If only `missionId` is passed, the latest MissionRun for that mission is used.  
  - Implementation: load state → if build_store and no job, call start_build_store → poll orchestra job until completed/failed → get_draft_summary → update MissionRun (currentStage, status, artifactSnapshot). Used so the Operator can run the full pipeline as a single tool.

- **runOperatorStep:**  
  - If `state.runPipelineAsSingleStep` and missionType is build_store and (planning or no job), one step runs `run_pipeline(missionRunId)` and returns updated state (or failed).

- **MissionRun:**  
  - New optional field: `runPipelineAsSingleStep` (Boolean, default false).  
  - `createMissionRun` and `saveOperatorState` accept/allow it; `rowToState` includes it.

- **Start API:**  
  - POST body may include `runPipelineAsSingleStep: true`.  
  - Passed through to `createMissionRun` so the client can request “run as single pipeline step” when starting a run.

- **Dashboard:**  
  - `operatorApi.startOperatorMission` accepts optional `runPipelineAsSingleStep` and sends it in the POST body.

**Note:** If you use Postgres, add the same `runPipelineAsSingleStep` field to the Postgres Prisma schema and run migrations.

---

## 4. Execution drawer: mode and Advanced view

**Files:**  
`apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/StoreRunwayPanel.tsx`

- **Mode display:**  
  - New optional prop: `mode?: 'pipeline' | 'operator'`.  
  - When artifacts are present, mode is shown as “Mode: AI Operator” or “Mode: Pipeline”, using `mode` prop if set, otherwise derived from `artifacts.operatorRunId` or `artifacts.agentThreadId` (Operator) vs not (Pipeline).

- **Advanced view (Agent Chat):**  
  - Unchanged: when `artifacts.agentThreadId` is set, the link is “Advanced view (Agent Chat)” with `href={/app/threads/${artifacts.agentThreadId}}`.  
  - stepHandlers already use the same path for the report link.

**Execution drawer (DAG steps):**  
The component that shows the full execution step list (e.g. ExecutionDrawer) was not found in this repo. **Recommendation:** Wherever that drawer is implemented, (1) show “Mode: AI Operator” or “Mode: Pipeline” from `plan.mode` (or fallback from `artifacts.operatorRunId`), (2) for Operator runs show stages from MissionRun `currentStage` (e.g. planning, running_job, checking_draft, awaiting_review, run_pipeline), and (3) show the “Advanced view (Agent Chat)” link when `artifacts.agentThreadId` is present, pointing to `/app/threads/${agentThreadId}`.

---

## 5. Route /app/threads/:threadId

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`

- **Added:** Under the `/app` route (ConsoleShell), a child route `threads/:threadId` that renders `ThreadChatView` (same as under `/app/back/threads/:threadId`).
- **Result:** “Advanced view (Agent Chat)” links to `/app/threads/${agentThreadId}` and now resolve to the Agent Conversation UI for that thread.

---

## 6. Checklist

| Item | Status |
|------|--------|
| plan.mode default 'operator' in generatePlan | Done |
| startExecution branches on useOperatorForPlan(plan) | Done |
| USE_AI_OPERATOR_FOR_STORE kept as kill switch | Done |
| run_pipeline tool in registry (missionRunId / missionId) | Done |
| runOperatorStep branch for runPipelineAsSingleStep | Done |
| MissionRun.runPipelineAsSingleStep (schema + state) | Done (SQLite) |
| Start API and client accept runPipelineAsSingleStep | Done |
| StoreRunwayPanel shows Mode and Advanced link | Done |
| Route /app/threads/:threadId | Done |
| Mode toggle UI in Mission Console | Not found in repo; default and wiring in place |
| Execution drawer (full step list + mode) | Not found in repo; StoreRunwayPanel and stepHandlers updated |

---

## 7. Assumptions

- **Plan creation:** The Mission Console (or equivalent) will call `generatePlan({ text, mode })` with `mode` from a Pipeline / AI Operator toggle and default that toggle to `'operator'`.
- **Postgres:** Only SQLite schema was updated; if you use Postgres, add `runPipelineAsSingleStep` to the MissionRun model there and migrate.
- **Prisma generate:** After schema change, run `npx prisma generate --schema prisma/sqlite/schema.prisma` (and for Postgres if applicable) so the client includes the new field.
