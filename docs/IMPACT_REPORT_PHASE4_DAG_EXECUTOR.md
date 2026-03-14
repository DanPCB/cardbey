# Impact Report: Phase 4 — DAG Executor + Persistent Execution State

**Scope:** planGenerator dependsOn (DAG), missionStore execution + report, dagExecutor, drawer shows live execution. No backend/LLM.

## Risk assessment

**(a) What could break**
- **missionStore:** Adding optional `execution` and `report` to Mission. Old missions without these fields must load without error (backward compatible).
- **PlanStep:** Adding optional `dependsOn?: string[]`. Existing plans in localStorage have no dependsOn; executor and UI must treat missing as `[]` (no deps).
- **Confirm & Run:** Replacing stub with real executor; if runAll or updateMission is wrong, mission could get stuck in running state. Mitigation: runAll checks for cancelled before each step; cancelled stops loop.
- **French Baguette E2E / auth / preview / routes:** No changes. Console mission flow and mission store only.

**(b) Why**
- Backward compatibility: Mission.execution and Mission.report optional; PlanStep.dependsOn optional; default to [] in executor.

**(c) Mitigation**
- Normalize execution in getMission (don’t mutate stored data): use as-is. Executor and UI guard on mission.execution?.nodeStatus.
- Cancel: set execution.status = 'cancelled' and stop runAll loop (check at start of each step).

**(d) Rollback**
- Revert Phase 4 commit(s). Restore planGenerator (remove dependsOn); missionStore (remove execution, report); remove dagExecutor.ts and tests; restore stub drawer flow and ExecutionDrawer stub UI; restore ConsoleContext openDrawerWithStub. No auth/store-creation rollback.

---

## DAG templates and stable ordering

**Stable ordering:** Tie-breaker = order in `plan.steps`. `computeRunnable` returns step IDs in the same order as `plan.steps` (only those that are ready). So multiple runnable nodes are run in array order.

**Step IDs (unchanged):** validate-context, human-approval, execute-tasks, report, deploy, review.

**Templates (dependsOn):**

| PlanType  | Steps (id order) | dependsOn |
|-----------|-------------------|-----------|
| store     | validate, execute, report | [], [validate], [execute] |
| campaign  | validate, execute, report | [], [validate], [execute] |
| social    | validate, execute, report | [], [validate], [execute] |
| cnet      | validate, deploy, report  | [], [validate], [deploy] |
| analytics | validate, execute, report | [], [validate], [execute] |
| recovery  | validate, execute, report | [], [validate], [execute] |
| unknown   | validate, execute, report | [], [validate], [execute] |
| operator  | approval, validate, execute, report | [], [approval], [validate], [execute] |

All DAGs are linear chains (one runnable at a time except possibly at start). Stable order = index in plan.steps.

---

## Implementation summary (Phase 4 complete)

### Files added
- `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/dagExecutor.ts` — initExecution, computeRunnable, runNextStep, runAll.
- `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/dagExecutor.test.ts` — vitest tests for DAG executor.

### Files modified
- `planGenerator.ts` — PlanStep.dependsOn; templates include dependsOn per PlanType.
- `missionStore.ts` — MissionExecution, MissionReport, Mission.execution, Mission.report; updateMission accepts execution/report.
- `ConsoleContext.tsx` — startExecution(missionId), cancelExecution(missionId), activeMissionId, missionSnapshot; removed stub drawer step flow.
- `MissionDetailView.tsx` — Confirm & Run calls startExecution(missionId).
- `ExecutionDrawer.tsx` — Props: open, mission, onCancel; renders steps with nodeStatus icons and mission.report when completed.
- `ConsoleShell.tsx` — Passes mission (missionSnapshot when active) and onCancel to ExecutionDrawer.

### Test commands
```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/app/console/missions/dagExecutor.test.ts
npx vitest run src/app/console/missions/planGenerator.test.ts
npm run build
```
Phase 4 tests (planGenerator, dagExecutor) pass. Some other test files in the repo fail for pre-existing path/alias reasons; not caused by Phase 4.

### Manual verification checklist
- [ ] Open /app → create/open a mission → open mission detail.
- [ ] Click **Confirm & Run**: drawer opens, status shows Validating… then Running…; step list shows pending → ready → running → completed in order.
- [ ] When complete: status **Completed**, Report section shows summary and completed steps.
- [ ] **Cancel**: during Validating or Running, click Cancel; status becomes Cancelled, loop stops.
- [ ] **Refresh mid-run**: refresh during Running; mission still has execution in localStorage; re-open mission/drawer and see current nodeStatus and status (rehydrated).

### Rollback plan
1. Revert Phase 4 commits (planGenerator, missionStore, dagExecutor + test, ConsoleContext, MissionDetailView, ExecutionDrawer, ConsoleShell).
2. Restore: planGenerator without dependsOn; missionStore without execution/report; remove dagExecutor.ts and dagExecutor.test.ts; ConsoleContext with openDrawerWithStub and drawerStep; ExecutionDrawer with step-based stub UI; MissionDetailView calling openDrawerWithStub.
3. No changes to auth, store creation, preview, /dashboard, /app/back.

---

## Phase 4.5 — DAG UX + execution hardening (UI-only)

### Changes
- **missionStore:** `MissionExecution.runId` optional; set at start to prevent ghost updates after cancel/restart.
- **ConsoleContext:** If `execution.status` is `validating` or `running`, `startExecution` no-ops and appends event "Already running". New run sets `runId` (uuid/timestamp) and passes it to `runAll`. Cancel appends event `{ type: 'cancelled', message: 'Cancelled by user' }`.
- **dagExecutor:** `runAll` accepts `runId` in options; at start of each step and before every `updateMission`, re-get mission and exit if `status === 'cancelled'` or `runId` no longer matches.
- **ExecutionDrawer:** "Runnable now:" block (from `computeRunnable(plan, nodeStatus)` → step titles). Per-step "Depends on: …" chips (resolve ids to titles). Running node highlighted (ring + background).
- **Tests:** runAll "cancel stops transitions", "runId prevents updates when runId changed", computeRunnable "excludes running node from runnable list".

### Rollback (Phase 4.5 only)
Revert missionStore (runId), ConsoleContext (guard + runId + cancel event), dagExecutor (runId checks), ExecutionDrawer (runnable block, depends-on chips, running highlight), and new test cases.

---

## Phase 4.5 (B) — Completed behavior + state pill + shouldStopRun

### Smallest diff — files changed
- **dagExecutor.ts:** Export `shouldStopRun(runId, mission)`; use it in `runAll` instead of inline checks.
- **dagExecutor.test.ts:** Add `describe('shouldStopRun')` (null, no execution, cancelled, runId mismatch, runId match).
- **ExecutionDrawer.tsx:** State pill for status (rounded-full bg-muted); truncate “Runnable now” when >3 items.
- **ConsoleContext.tsx:** Add `openDrawerForMission(missionId)` (setDrawerOpen(true), setActiveMissionId, setMissionSnapshot).
- **PlanProposalBlock.tsx:** Add `executionStatus`, `onViewReport`, `onStartNewMission`. When `executionStatus === 'completed'`, show “View report” + “Start new mission” instead of Confirm & Run / Modify / Cancel.
- **MissionDetailView.tsx:** Pass `executionStatus={displayMission.execution?.status}`, `onViewReport`, `onStartNewMission`; use `useOutletContext` for composer focus; use `missionFromStore` for display so completed status is visible.

### Completed mission behavior (lock to B)
- If `mission.execution.status === 'completed'`: no “Confirm & Run”. Show “View report” (opens drawer with report) and “Start new mission” (navigate to /app, focus composer). Re-run not implemented.

### Manual test checklist (Phase 4.5 B)
- [ ] Run a mission to completion. On mission detail, “Confirm & Run” is gone; “View report” and “Start new mission” visible.
- [ ] “View report” opens drawer and shows report section.
- [ ] “Start new mission” navigates to /app and focuses composer.
- [ ] Drawer status shows as pill (Validating / Running / Completed / Cancelled).
- [ ] “Runnable now” truncates when many steps (e.g. first 3 + “…”).

### Rollback (Phase 4.5 B only)
Revert PlanProposalBlock (completed UI), MissionDetailView (outlet context, displayMission, callbacks), ConsoleContext (openDrawerForMission), ExecutionDrawer (pill, truncate), dagExecutor (shouldStopRun + use in runAll), dagExecutor.test (shouldStopRun tests).

---

## Phase 4.6 — Completed mission UX + cap execution events

### Risk
None to store creation, auth, or preview. Console mission execution and mission store only; event cap is additive.

### Changes
- **Completed mission UI:** Already in place (Phase 4.5 B): when `execution.status === 'completed'`, PlanProposalBlock shows "View report" and "Start new mission" only.
- **Event cap:** `missionStore.appendCappedEvents(events, newEvent, 50)` keeps last 50 entries. Used in ConsoleContext when appending `already_running` and `cancelled` events.
- **Tests:** `missionStore.test.ts` — appendCappedEvents: append when empty, keep last 50 when 51 total, custom cap.

### Manual checklist (Phase 4.6)
- [ ] Completed mission still shows View report / Start new mission (no Confirm & Run).
- [ ] After many duplicate "Confirm & Run" clicks (already running) or cancel events, `mission.execution.events.length` does not exceed 50 (e.g. inspect in devtools or add a log).

### Rollback (Phase 4.6 only)
Revert missionStore (appendCappedEvents), ConsoleContext (use appendCappedEvents), missionStore.test.ts.
