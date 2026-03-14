# After Foundation 1 → 2 → 3: Next Steps & UI Testing

**Source:** [CARDBEY_AGENTIC_INTEGRATION_IMPLEMENTATION_PLAN.md](./CARDBEY_AGENTIC_INTEGRATION_IMPLEMENTATION_PLAN.md)

---

## 1. Next steps after Foundation 1, 2, and 3 are complete

Once all three foundations are implemented and close-out tests pass, the following are the intended next steps (from the plan’s “Defer” and follow-up items).

| Priority | Area | What to do |
|----------|------|------------|
| **1** | **M2 unification** | Unify pipeline and AI Operator modes on a single plan shape. Associate orchestra jobs with missions (formal Mission relation; today Session 3 uses `missionPlan[jobId]` with optional `missionId` on OrchestratorTask). Single retrieval path for “execution plan” regardless of entry point. |
| **2** | **M3 checkpoints** | Add user-review checkpoints (e.g. CopyAgent “review before apply”). Depends on F1 (plan + steps) and F2 (agent context). |
| **3** | **Step events for all intents** | Wire `step_started` / `step_completed` for intents that currently only get `plan_created`: `create_offer`, `create_qr_for_offer`, `mi_assistant_message`, publish intents. Otherwise the Execution UI shows a plan whose steps never leave “pending”. |
| **4** | **Mission Execution UI plan source** | Update the dashboard to fetch and display the **execution** plan from the backend (e.g. unified endpoint returning `Mission.context.missionPlan` or `chainPlanToExecutionPlan`). Today the UI uses the resolver’s `plan`; after F1 the backend has the real execution plan. |
| **5** | **Resolver vs execution plan (optional)** | Option B: have the resolver (or a backend planner) produce an execution plan at mission creation for known types and reuse it at first intent run. Follow-up once F1 is stable. |
| **6** | **Chain plan storage migration** | Migrate the existing chain plan storage format to align with the execution plan shape. Deferred until F1 is stable; Session 3 only adds a read-only adapter. |
| **7** | **Entity framework & device modularity** | Proceed in parallel or incrementally as product requires. |
| **8** | **Full LLM migration** | Incremental; F3 uses the existing LLM path. |

---

## 2. How to test the foundations

### 2.1 Backend / E2E (API) testing

The plan defines close-out E2E tests for each foundation. Run them with the API (and same DB) available.

**Prerequisites**

- Backend API running (same `DATABASE_URL` as tests).
- JWT for authenticated requests (e.g. from `POST /api/auth/login` or your app).

**Foundation 1 close-out**

1. Start API (e.g. SQLite test DB):
   ```powershell
   cd c:\Projects\cardbey\apps\core\cardbey-core
   $env:DATABASE_URL="file:./prisma/test.db"; $env:NODE_ENV="test"; npm run start:api
   ```
2. In another terminal, run the F1 E2E test (use a real JWT if the test calls protected endpoints):
   ```powershell
   cd c:\Projects\cardbey\apps\core\cardbey-core
   $env:E2E_AUTH_TOKEN="Bearer YOUR_JWT"; npm run test:e2e:foundation1
   ```
   Or run the Vitest file directly:
   ```powershell
   npx vitest run src/test/e2e/foundation1-closeout.e2e.test.js
   ```
   Set `E2E_API_BASE_URL` if the API is not on `localhost:3001`.

**What the F1 test asserts (from the plan)**

1. Start orchestra job via `POST /api/mi/orchestra/start`.
2. Run via `POST /api/mi/orchestra/job/:jobId/run`.
3. `OrchestratorTask.missionId` is set.
4. `Mission.context.missionPlan[jobId]` exists with correct steps.
5. `MissionEvent` stream contains `plan_created` with matching planId.
6. `chainPlanToExecutionPlan(mission with chain plan)` returns a valid ExecutionMissionPlan.

**Foundation 2 & 3**

- Scripts exist in core: `npm run test:e2e:foundation2`, `npm run test:e2e:foundation3` (implement when those foundations are built). Same pattern: run API with test DB, then run the corresponding E2E script with `E2E_AUTH_TOKEN` and optional `E2E_API_BASE_URL`.

---

### 2.2 UI testing (dashboard)

The dashboard today uses the **resolver** plan and **execution** status; it does **not** yet read `Mission.context.missionPlan` or the unified execution plan. After F1 (and the optional “Mission Execution UI plan source” step above), the UI can show the real execution plan and step status.

**How to run the app for UI testing**

1. **Backend (core API):**
   ```powershell
   cd c:\Projects\cardbey\apps\core\cardbey-core
   npm run dev:api
   ```
   (Or use your usual DB and port; default API often runs on port 3001.)

2. **Dashboard (frontend):**
   ```powershell
   cd c:\Projects\cardbey\apps\dashboard\cardbey-marketing-dashboard
   pnpm dev
   ```
   Open the URL Vite prints (e.g. `http://localhost:5173` or `5174`).

**Where to look in the UI**

| Foundation | Where in UI | What to verify |
|------------|--------------|----------------|
| **F1 – Execution plan** | **Console** → start a mission (e.g. store build or an intent from Mission Inbox) → open **Execution drawer** (right panel). | After F1 + UI wiring: the drawer should show the **execution** plan (steps with agentType/labels) and step status (pending → running → completed). Today it shows resolver plan + reconciled status; once the backend exposes the unified plan and the dashboard uses it, you’ll see the F1 plan and events. |
| **F1 – Orchestra** | Start a **store build** (or other orchestra entry) from the console. | After F1: run the F1 E2E first to confirm backend behavior; then in the UI start the same flow and confirm the mission has a plan and the run completes. Optional: add a dev-only call to fetch mission by `missionId`/`jobId` and inspect `context.missionPlan` to confirm. |
| **F1 – Intent run** | **Mission Inbox** (inside Execution drawer when a store mission has a storeId): queue an intent (e.g. create offer), click **Run**. | After F1: `plan_created` and ideally `step_started`/`step_completed` for that intent; plan stored under `missionPlan[intentId]`. UI test: run an intent and confirm the drawer updates (and, once wired, shows the execution steps). |
| **F2 – Agent context** | Flows that run **CatalogAgent then CopyAgent** (e.g. store build, or catalog + copy intents). | Backend/E2E: assert CopyAgent receives product context and `context_update` events. UI: same flow; qualitatively confirm copy/descriptions are coherent with catalog (no strict UI assertion until you add one). |
| **F3 – LLM opportunities** | **Growth opportunities** in the Execution drawer (for a store mission with storeId). | After F3: trigger `opportunity_inference` (nightly or threshold). In the UI, open the drawer for a mission that has a store; in “Growth opportunities” confirm some opportunities have `source: 'llm_inference'` (if the UI shows source). Accept one and confirm an IntentRequest is created and appears in Mission Inbox. |

**Mission Inbox and opportunities (today)**

- **Mission Inbox:** Shown in the Execution drawer when `mission?.report?.storeId ?? mission?.artifacts?.storeId` is set. It lists intents and allows “Run” for queued intents (`listMissionIntents`, `runMissionIntent`).
- **Growth opportunities:** Fetched by `getStoreOpportunities(storeId, 7)` and rendered in the same drawer. After F3, new opportunities can come from `opportunity_inference` with `source: 'llm_inference'`; the accept flow stays the same.

**Minimal UI test checklist (after F1–F3 + optional plan wiring)**

1. Log in, open Console, start a store build (or equivalent orchestra job). Confirm execution runs and drawer shows progress.
2. In a mission with a store, open Mission Inbox, add an intent (e.g. create offer), click Run. Confirm intent completes and any new plan/step UI reflects it (once wired).
3. In the same drawer, open Growth opportunities. After F3, confirm LLM-inferred opportunities appear when available; accept one and confirm it becomes an intent in the inbox.

---

## 3. Summary

- **After F1→F2→F3:** Focus next on M2 unification, M3 checkpoints, wiring step events for all intents, and feeding the Mission Execution UI from the unified execution plan. Then optional resolver/execution alignment, chain plan migration, entity framework, device modularity, and LLM migration.
- **Backend testing:** Use `npm run test:e2e:foundation1` (and foundation2/3 when added) with the API running and `E2E_AUTH_TOKEN` set.
- **UI testing:** Run core API + dashboard, use Console → Execution drawer and Mission Inbox / Growth opportunities to validate F1 (plan + steps), F2 (context-aware flows), and F3 (LLM opportunities and accept flow).
