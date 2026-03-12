# Mission Pipeline End-to-End Audit and Fix Plan

**Scope:** Live Cardbey store mission execution as an end-to-end production wiring problem. No product redesign; make the existing pipeline reliable with the smallest safe fixes.

**LOCKED RULE:** Before coding execution, assess whether any refactor could break the current workflow. Do not redesign the mission product.

---

## 1. Canonical end-to-end path: "Create store for my business"

| Step | Description | Route / service | DB / state |
|------|-------------|-----------------|------------|
| 1. Mission creation | User starts store creation; frontend may create local mission id or use job as mission | Frontend: missionStore / Quick Start → `POST /api/mi/orchestra/start` | — |
| 2. Job + draft creation | Backend creates OrchestratorTask (job) and optionally DraftStore; links mission = job.id | `handleOrchestraStart` (miRoutes.js) → `prisma.orchestratorTask.create`, `createDraftStoreForUser` or reuse draft by generationRunId | `OrchestratorTask`, `DraftStore`, `Mission` (id = job.id) |
| 3. Mission artifact persistence | Backend ensures Mission row (id = jobId); task.missionId set | `getOrCreateMission(missionIdForPlan, …)` where `missionIdForPlan = job.id`; `orchestratorTask.update({ missionId })` | `Mission`, `OrchestratorTask.missionId` |
| 4. Job/run execution | Build-store job runs in-process (no separate worker) | `runBuildStoreJob(prisma, job.id, createdDraftId, resolvedRunId)` (orchestraBuildStore.js) via setImmediate | Task: queued → running → completed/failed; DraftStore: generating → ready |
| 5. Generation execution | Draft content generated | `generateDraft(draftId)` inside runBuildStoreJob (draftStoreService.js) | DraftStore.status, DraftStore.preview |
| 6. Mission events streaming | UI polls for timeline events | `GET /api/mi/missions/:missionId/events?limit=200&jobId=...` (miIntentsRoutes.js) | `MissionEvent` rows (missionId, type, agent, payload) |
| 7. Draft summary / reopen | UI loads draft for review | `GET /api/draft-store/:draftId/summary` (draftStore.js) | DraftStore; ownership via canAccessDraftStore |
| 8. Review page loading | Review page shows draft and job status | Same summary + `GET /api/mi/orchestra/job/:jobId` (miRoutes.js) | OrchestratorTask.status, result |
| 9. Publish handoff | User commits draft to store | `POST /api/draft-store/:draftId/commit` (draftStore.js) | DraftStore → Store, Business, etc. |

---

## 2. ID trace for one mission run

| ID | Set when | Where | Used by |
|----|----------|--------|---------|
| **missionId** | For orchestra/start: `missionIdForPlan = job.id` (miRoutes.js L1244). Mission row created/updated with this id. | `Mission.id`, `OrchestratorTask.missionId` | GET events (`missionId` in URL), canAccessMissionForIntents |
| **draftId** | From `POST /api/draft-store` (Phase 0) or from orchestra/start response (`responseDraftId` / `createdDraftId`) | DraftStore.id | GET summary, POST generate, POST commit, review URL |
| **jobId** | From `orchestratorTask.create` in handleOrchestraStart; returned as `jobId` in response | OrchestratorTask.id | GET job status, runBuildStoreJob, events access fallback (query.jobId) |
| **runId** | Same as generationRunId in this flow | — | — |
| **generationRunId** | Client body or default `job.id`; stored in task.request and DraftStore | OrchestratorTask.request.generationRunId, DraftStore.generationRunId | runBuildStoreJob, getDraftByGenerationRunId, review URL |

**Critical:** In the orchestra/start path, **missionId === jobId**. The frontend must use the **jobId** returned by orchestra/start as the **missionId** when calling `GET /api/mi/missions/:missionId/events`. If the frontend uses a different mission id (e.g. a client-generated `mission-${Date.now()}-...`), the events endpoint will query MissionEvent for that id and get no rows (and mission access check may fail unless jobId is passed as query).

---

## 3. Handoff points and where the pipeline can claim progress before the next dependency is valid

| Handoff | Risk | Why |
|---------|------|-----|
| Response `draftId` before runBuildStoreJob runs | UI shows draftId but draft may still be in `generating`; GET summary returns 200 with status `generating`. Not wrong but UI can show "loading" until status `ready`. | OK if UI polls summary until ready. |
| Response `jobId` as missionId | Backend uses jobId as Mission.id. If frontend stores a different missionId and later polls events with that, events are empty and access may 403. | **Broken:** Frontend must use jobId as missionId for orchestra flow when polling events. |
| Events stream empty | runBuildStoreJob does **not** call `stepReporter.started('catalog')` / `stepReporter.completed('catalog')`; only `stepReporter.failed` on error. So no MissionEvent rows are written for the build_store step. | **Broken:** Event stream stays empty for orchestra build_store unless intents path or another path emits. |
| GET summary 404 (DRAFT_NOT_FOUND) | Draft created in one DB/env but GET summary served by another, or draft never created (e.g. wrong goal so needDraft false but UI expects draft), or ownership check fails. | **Broken:** Same DATABASE_URL and correct draft-store mount required; Phase 0 vs orchestra path must both set draftId that exists in same DB. |
| Review page uses draftId from artifacts | If artifacts.draftId was set from a different run or client-only id, GET summary returns 404. | **Broken:** artifacts.draftId must be the id returned by POST draft-store or orchestra/start. |
| Prisma client without MissionEvent | miIntentsRoutes uses `prisma.missionEvent`; stepReporter uses `prisma.missionEvent.create`. If schema used for `prisma generate` does not include MissionEvent, client has no missionEvent delegate → 503 (events) or stepReporter throws. | **Broken:** Schema must include MissionEvent and Prisma client generated from it. |

---

## 4. Exact files and services involved

| Area | File(s) | Purpose |
|------|---------|--------|
| Mission creation (orchestra) | `src/routes/miRoutes.js` | handleOrchestraStart: create job, draft, Mission (id=job.id), call runBuildStoreJob |
| Job + draft creation | `src/services/draftStore/orchestraBuildStore.js` | createBuildStoreJob (used by business create); runBuildStoreJob (called from miRoutes) |
| Draft CRUD | `src/routes/draftStore.js` | POST /, GET /:draftId/summary, POST /:draftId/generate, POST /:draftId/commit |
| Draft service | `src/services/draftStore/draftStoreService.js` | createDraftStoreForUser, generateDraft, getDraft, getDraftByGenerationRunId |
| Mission events | `src/routes/miIntentsRoutes.js` | GET /missions/:missionId/events; canAccessMissionForIntents; optional jobId fallback for access |
| Event emission | `src/services/miAgents/emitMissionEvent.js` | emitMissionEvent (MissionEvent.create) |
| Step progress | `src/lib/missionPlan/stepReporter.js` | createStepReporter; emits MissionEvent via prisma.missionEvent.create |
| Run job | `src/services/draftStore/orchestraBuildStore.js` | runBuildStoreJob: transition task, generateDraft; stepReporter only used in catch (failed) |
| Route mounts | `src/server.js` | app.use('/api/mi', miIntentsRoutes); app.use('/api/draft-store', draftStoreRoutes); app.use('/api/mi', miRoutes) |
| DB/client | `src/db/prisma.js` | getPrismaClient(); schema must include Mission, MissionEvent, OrchestratorTask, DraftStore |
| Ownership | `src/lib/draftOwnership.js` | canAccessDraftStore, isDraftOwnedByUser (orchestra path: generationRunId → OrchestratorTask.userId) |

---

## 5. Live production environment dependencies

| Dependency | Check | Notes |
|------------|--------|------|
| Mounted routes | server.js mounts miIntentsRoutes at `/api/mi`, draftStore at `/api/draft-store`, miRoutes at `/api/mi` | Confirmed in repo; deploy must include this server entry. |
| Runtime package | Node + tsx for .ts imports (orchestrator, etc.) | Required for miRoutes and draftStoreService (dynamic TS imports). |
| DATABASE_URL | Single persistent DB for all processes that create/read DraftStore and Mission | Ephemeral SQLite in /tmp → data loss on restart; production should use Postgres. |
| Worker/runtime | runBuildStoreJob runs in-process (setImmediate) in the same Node process that serves API | No separate worker; same process and same DB. |
| Events route behavior | GET /api/mi/missions/:id/events returns 200 + { events } or 401/403/503 | 404 → route not matched (wrong deploy). 503 → prisma.missionEvent missing (schema/generate). |
| Prisma schema | Must include Mission, MissionEvent, OrchestratorTask, DraftStore, IntentRequest, etc. | Client generated from schema that has MissionEvent; e.g. prisma/sqlite/schema.prisma or prisma/postgres/schema.prisma. |

---

## 6. Minimal fix plan (smallest safe set)

**Do not rewrite unrelated homepage/assistant/storefront code.**

1. **Ensure events stream receives events for orchestra build_store (backend)**  
   - **Problem:** runBuildStoreJob never calls stepReporter.started/completed for the catalog step, so no MissionEvent rows are created and the events stream is empty.  
   - **Fix:** In `orchestraBuildStore.js` inside runBuildStoreJob, before calling `generateDraft`, call `options.stepReporter?.started?.('catalog')` (await or fire-and-forget). On success (after marking task completed), call `options.stepReporter?.completed?.('catalog')`. Already call `stepReporter.failed('catalog', …)` in catch.  
   - **Risk:** Low. stepReporter is already passed and used on failure; adding started/completed only adds events. If prisma.missionEvent is missing, stepReporter already no-ops when prisma is missing; but emitStepEvent does prisma.missionEvent.create — so if missionEvent is undefined, it would throw. stepReporter is created with that prisma instance; if the client has no missionEvent, the create would throw and be caught in emitStepEvent (log and ignore). So safe.  
   - **Implemented:** In `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js`, added `await options.stepReporter?.started?.('catalog').catch(() => {});` before `generateDraft` and `await options.stepReporter?.completed?.('catalog').catch(() => {});` after successful generateDraft (before content ingest and task completed transition).

2. **Ensure frontend uses jobId as missionId for events (frontend)**  
   - **Problem:** If the UI polls GET /api/mi/missions/:missionId/events with a client-generated missionId instead of jobId, events are empty and access may fail.  
   - **Fix:** In the dashboard/frontend, for the orchestra/start flow, when storing “mission” for the execution drawer, set missionId to the jobId returned by POST /api/mi/orchestra/start. When calling listMissionEvents(missionId, limit, jobId), pass that jobId as missionId (or ensure missionId === jobId and pass jobId in query for access fallback). Exact file: wherever the response of orchestra/start is handled and mission/artifacts are set (e.g. missionStore or step handler that receives jobId/draftId).  
   - **Risk:** Low. Aligns UI with backend contract (missionId === jobId for this path).

3. **Confirm Prisma schema and generate (deploy)**  
   - **Problem:** If MissionEvent is not in the schema used to generate the client on Render, GET events returns 503 and stepReporter would throw on create.  
   - **Fix:** Verify the schema used in the cardbey-core build (e.g. prisma/sqlite/schema.prisma or prisma/postgres/schema.prisma) includes model MissionEvent (missionId, intentId?, agent, type, payload, createdAt). Run `prisma generate` with that schema in the Render build so the deployed client has prisma.missionEvent.  
   - **Risk:** None if schema already has it; if not, adding it is required for events to work.

4. **DRAFT_NOT_FOUND / draft persistence (already documented)**  
   - Ensure single DATABASE_URL on Render for cardbey-core.  
   - Ensure draft-store routes are deployed (already mounted in server.js).  
   - No code change if env and deploy are correct.

5. **No change to:** homepage, assistant, storefront, or unrelated MI/orchestrator logic. No redesign of mission product.

---

## 7. Manual verification checklist (one successful live mission run)

Use this for one full store mission on staging/live after applying the minimal fixes.

- [ ] **1. Start store mission**  
  Trigger “Create store” (Quick Start or equivalent). Request: `POST /api/mi/orchestra/start` with goal e.g. `build_store`, businessName, etc.  
  - Response: `200`, body has `jobId`, `draftId`, `generationRunId`.  
  - Logs: OrchestratorTask created, draft created or reused, runBuildStoreJob invoked.

- [ ] **2. IDs consistent**  
  - Note `jobId` and `draftId` from response.  
  - Open review URL or execution drawer using that `draftId` and `jobId` (or generationRunId).  
  - For events, use `missionId = jobId` (same value).

- [ ] **3. Events stream**  
  - Request: `GET /api/mi/missions/<jobId>/events?limit=200` (with auth).  
  - Response: `200`, body `{ ok: true, events: [...] }`.  
  - After runBuildStoreJob progress, events array should contain at least one event (e.g. step_started / step_completed for catalog if fix (1) applied).

- [ ] **4. Draft summary**  
  - Request: `GET /api/draft-store/<draftId>/summary` (with auth).  
  - Response: `200`, body includes draftId, status (eventually `ready`), preview.  
  - No 404, no DRAFT_NOT_FOUND in UI.

- [ ] **5. Job status**  
  - Request: `GET /api/mi/orchestra/job/<jobId>` (with auth).  
  - Response: `200`, task status progresses from queued → running → completed; result includes draftId.

- [ ] **6. Draft reopen / review page**  
  - Navigate to review page with draftId (and jobId if needed).  
  - Page loads draft summary and shows store preview when status is ready.  
  - No infinite loading, no 404.

- [ ] **7. Publish handoff**  
  - From review, submit commit (e.g. POST /api/draft-store/:draftId/commit with email/password if required).  
  - Response: success; store/user created or linked as designed.

- [ ] **8. Environment**  
  - DATABASE_URL on Render is persistent (e.g. Postgres).  
  - Same cardbey-core service serves draft-store and /api/mi; no 404 on events or summary.

---

## 8. Summary table

| Item | Status / action |
|------|------------------|
| Canonical path | orchestra/start → job + draft + Mission (id=jobId) → runBuildStoreJob → generateDraft → events (MissionEvent), summary, commit |
| missionId === jobId | For orchestra flow, backend sets missionId = job.id; frontend must use jobId as missionId for events and mission APIs. |
| Events empty | runBuildStoreJob does not emit step events; add stepReporter.started/completed('catalog') in orchestraBuildStore.js. |
| Events 404 | Route is mounted in server.js at /api/mi; if still 404, deploy or path mismatch. |
| Events 503 | prisma.missionEvent missing; ensure schema has MissionEvent and generate client in build. |
| DRAFT_NOT_FOUND | Same DATABASE_URL, draft-store deployed, draftId from same run; see existing audit. |
| Minimal code changes | (1) orchestraBuildStore.js: emit started/completed for catalog; (2) frontend: use jobId as missionId for orchestra flow; (3) schema + generate for MissionEvent. |
| Verification | Single full run: start → events 200 + non-empty after job run → summary 200 → review loads → commit succeeds. |
