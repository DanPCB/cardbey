# Sessions 1 and 2 — Implementation Report

**Scope:** Expose unified execution plans from the backend and add them to the mission GET response so the Mission Execution UI can display execution plans from both intent-run (`missionPlan`) and Agent Chat (`chainPlan` via adapter) under one contract.

---

## 1. What was in scope (from plan)

| Item | Instruction | Status |
|------|-------------|--------|
| **unifiedPlan.js** | New / add `getUnifiedExecutionPlans(context)` | **Already present** — no code change. |
| **missionsRoutes.js** | Add `executionPlans` to mission GET response | **Done.** |
| **Do not touch** | chainPlan.js (write/advance logic) | Not modified. |
| **Do not touch** | chainPlanToExecutionPlan.js (adapter) | Not modified; unifiedPlan.js already calls it. |
| **Do not touch** | Mission.context schema | No new fields, no migration. |

---

## 2. Current state (verified)

- **`apps/core/cardbey-core/src/lib/missionPlan/unifiedPlan.js`**  
  - Already exports `getUnifiedExecutionPlans(context)`.  
  - Uses `context.missionPlan` (map by jobId/intentId) and `context.chainPlan`; for chainPlan it calls `chainPlanToExecutionPlan(chainPlan)`.  
  - Returns a sorted array of `ExecutionMissionPlan` (most recent first).  
  - **No edits.**

- **`apps/core/cardbey-core/src/lib/missionPlan/chainPlanToExecutionPlan.js`**  
  - Adapter: `chainPlan` → `ExecutionMissionPlan` (cursor → step status).  
  - **Not touched.**

- **`apps/core/cardbey-core/src/lib/chainPlan.js`**  
  - Chain plan write/advance logic.  
  - **Not touched.**

---

## 3. Changes made

### 3.1 Backend — missionsRoutes.js

**File:** `apps/core/cardbey-core/src/routes/missionsRoutes.js`

- **Import:** `getUnifiedExecutionPlans` from `../lib/missionPlan/unifiedPlan.js`.
- **GET /api/missions/:missionId:**  
  - After loading the mission and before `res.json`:  
    - `const executionPlans = getUnifiedExecutionPlans(mission.context ?? undefined);`  
  - Response shape:  
    - **Before:** `{ ok: true, mission }`  
    - **After:** `{ ok: true, mission, executionPlans }`  
  - `executionPlans` is an array of execution-plan objects (missionPlan entries + one from chainPlan when present). No change to `mission` or `Mission.context` schema.

### 3.2 Dashboard — consume executionPlans

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/missionIntent.ts`

- **getMissionFromApi:**  
  - Return type and implementation now include optional `executionPlans` (unified list from backend).  
  - JSDoc updated to describe `executionPlans`.

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx`

- **missionContextFromApi state:**  
  - Now holds optional `executionPlans` in addition to `context` (with `missionPlan`).  
- **Execution plan selection:**  
  - Prefer `missionContextFromApi.executionPlans` when present: pick by `mission?.artifacts?.jobId` (match `intentId`/`planId`) or use first plan with steps.  
  - Fallback: existing logic using `context.missionPlan` (by jobId or latest).  
- **GET response usage:**  
  - When `getMissionFromApi(mission.id)` returns `res.executionPlans`, it is stored and used in the memo above.

---

## 4. Files touched

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/missionsRoutes.js` | Import `getUnifiedExecutionPlans`; in GET `/:missionId`, compute `executionPlans` and return `{ ok: true, mission, executionPlans }`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/missionIntent.ts` | Add `executionPlans` to `getMissionFromApi` return type and pass-through from API. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx` | Store `executionPlans` from API; prefer unified `executionPlans` when picking which plan to show; fallback to `context.missionPlan`. |

**Not modified:**  
`unifiedPlan.js`, `chainPlanToExecutionPlan.js`, `chainPlan.js`, Mission.context schema, any other routes or libs.

---

## 5. Behaviour summary

- **Backend:** GET `/api/missions/:missionId` now returns a unified list of execution plans (intent-run plans from `context.missionPlan` plus, when present, one plan from `context.chainPlan` via `chainPlanToExecutionPlan`).  
- **Frontend:** Execution drawer uses this list when available (with jobId-aware selection), and otherwise keeps using `context.missionPlan` so existing behaviour is preserved.  
- **Contract:** Single read surface for the UI; no writes to Mission.context, no change to chain plan advance/retry/skip logic, no schema or migration.

---

## 6. How to verify

1. **Backend:** Call GET `/api/missions/:missionId` with a mission that has `context.missionPlan` and/or `context.chainPlan`. Response must include `executionPlans` (array).  
2. **Dashboard:** Open a mission with execution data; open the Execution drawer. The “Execution plan” block should show the same or better plan (e.g. including chain plan when applicable).  
3. **Regression:** Missions that only have `context.missionPlan` (no chain plan) still show the correct plan via fallback.

---

## 7. Risk

- **Low:** Additive only. No change to chain plan logic, Mission.context shape, or existing mission GET fields other than adding `executionPlans`. Fallback keeps previous UI behaviour when `executionPlans` is missing or empty.
