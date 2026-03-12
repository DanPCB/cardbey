# Audit: DRAFT_NOT_FOUND and Mission Events 404 in Production

**Scope:** Production/live diagnosis only. No mission architecture rewrite. Smallest safe fix.

**Observed symptoms:**
1. Mission UI shows "Context ready" and Draft / Job / Run IDs.
2. Mission execution fails with **404 Not found**, **Code: DRAFT_NOT_FOUND**.
3. Browser: `GET /api/mi/missions/:missionId/events?limit=200` returns **404** from `cardbey-core.onrender.com`.

---

## 1. Root cause summary

| Issue | Root cause | Where |
|-------|------------|--------|
| **Events 404** | The **events route is not registered or not mounted** on the live core service. The handler exists in this repo (`apps/core/cardbey-core/src/routes/miIntentsRoutes.js`) but the **Express app that runs on Render** likely does not mount the MI intents router at `/api/mi`, or the deployed codebase does not include this route. | Backend deploy (cardbey-core.onrender.com) |
| **DRAFT_NOT_FOUND** | The **draft-store API** (e.g. `GET /api/draft-store/:draftStoreId/summary` or `POST .../generate`) returns **404** when the mission step runs. The frontend maps that 404 to `errorCode: 'DRAFT_NOT_FOUND'` and shows it in the Execution panel. The draft id shown in the UI comes from `mission.artifacts` (set earlier in the flow); when the **same** backend is asked for that draft in production, it returns 404 → draft either **does not exist in the production DB** or the **draft-store endpoint is missing/different** in the live deploy. | Backend (same DB/env as creator path?) + frontend step handlers |

---

## 2. Trace of live mission flow

1. **Mission creation**  
   - Frontend creates mission in local state with id `mission-${Date.now()}-${random}` (e.g. `mission-1773282287112-10jm7n6`).  
   - See: `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/missionStore.ts` (createMission).

2. **Draft creation / persistence**  
   - **Phase 0 (no job):** `runValidateStoreContextPhase0` → `postDraftStoreCreate` → `POST /api/draft-store` (body: name, category, missionId).  
   - Backend returns `draftStoreId`; frontend sets `mission.artifacts.draftStoreId` and `draftId`.  
   - **With job:** draft can come from orchestra job (`extractJobDraftId`) or from `getDraftIdByGenerationRunId`.  
   - Draft is persisted by the **backend** that serves `POST /api/draft-store` and `GET /api/draft-store/:id/summary` (same service as cardbey-core).

3. **Job/run creation**  
   - Store mission can get `jobId` / `generationRunId` from orchestra/plan; UI displays them from `mission.artifacts`.

4. **Executor lookup of draft**  
   - Step handlers call `getDraftStoreSummary(draftStoreId)` → `GET /api/draft-store/:draftStoreId/summary`.  
   - If that returns 404, handlers return `{ ok: false, errorCode: 'DRAFT_NOT_FOUND', message }`.  
   - See: `stepHandlers.ts` (runValidateStoreContextPhase0 catch, runExecuteTasksStorePhase0 catch, runValidateStoreContext when `err.error === 'DRAFT_NOT_FOUND'`).

5. **Mission events endpoint**  
   - Frontend: `listMissionEvents(missionId, 200, jobId)` → `GET /api/mi/missions/${missionId}/events?limit=200&jobId=...`.  
   - Request goes to same origin as other API calls (production: `cardbey-core.onrender.com` via `getCoreOrigin()` / `buildApiUrl`).  
   - Backend route in repo: `router.get('/missions/:missionId/events', optionalAuth, ...)` in `miIntentsRoutes.js`; full path is `/api/mi/missions/:missionId/events` **only if** the app mounts this router at `/api/mi`.

---

## 3. Where draft id is shown and persisted

- **Shown in UI:** `mission.artifacts.draftId` / `draftStoreId` / `jobId` / `generationRunId` (ExecutionDrawer, MissionProcessingSummary, etc.).  
- **Set by:**  
  - Phase 0: after `postDraftStoreCreate` → `draftStoreId` from response.  
  - With job: `resolveDraftIdForMission` → orchestra job or `getDraftIdByGenerationRunId`.  
- **Persisted:** In the **backend** that implements `POST /api/draft-store` and `GET /api/draft-store/:id/summary` (DraftStore table or equivalent). That backend must use the **same DATABASE_URL** and same deploy as the one used when the draft was created.

---

## 4. Same DB / environment check

- **Executor path:** Step handlers call `getDraftStoreSummary(draftStoreId)` and `postDraftStoreGenerate(draftStoreId)` against the **same base URL** as other API calls (production: cardbey-core.onrender.com). So the “executor” is the same HTTP client and same service.  
- **Creator path:** `postDraftStoreCreate` and draft-store create/summary/generate are the same service.  
- **Conclusion:** If the draft was created in production, the same service and DB should see it **unless**:  
  - The draft was never created (e.g. Phase 0 create failed or wasn’t run, and artifacts came from a different run/env),  
  - **DATABASE_URL** or DB differs between the process that created the draft and the one serving GET summary (e.g. multiple core instances with different env, or a separate worker DB),  
  - The **draft-store routes** are not deployed or are behind a different base path on Render.

---

## 5. Production env vars to audit

Audit these on **Render** for the **cardbey-core** service (and any worker/executor that touches drafts or missions):

| Var | Purpose | Risk if wrong |
|-----|---------|----------------|
| **DATABASE_URL** | Prisma / DB connection | Draft created in DB A, read from DB B → 404. |
| **NODE_ENV** | Environment | Can affect auth bypass (e.g. dev temp user) and logging. |
| Service base URLs | If frontend or another service calls core | Wrong URL → 404 or wrong service. |
| Mission/orchestrator URLs | If core calls orchestra or another service | Stale or wrong URL → missing job/draft. |
| Tenant/auth (e.g. JWT_SECRET, CORS) | Auth and tenant context | 403/401 or cross-tenant; usually not 404. |

**Frontend (cardbey.com / static site):**

- **VITE_CORE_BASE_URL** / **VITE_CORE_RENDER_URL** (or equivalent): must point to the **same** cardbey-core service that has `/api/mi` and `/api/draft-store` (e.g. `https://cardbey-core.onrender.com`).  
- Fallback in code: `CORE_URL_RENDER_FALLBACK = 'https://cardbey-core.onrender.com'`.

---

## 6. Is `/api/mi/missions/:id/events` registered and deployed?

- **In this repo:** Yes. Implemented in `apps/core/cardbey-core/src/routes/miIntentsRoutes.js`:  
  - `router.get('/missions/:missionId/events', optionalAuth, async (req, res) => { ... })`.  
  - Responds with 401/403/400/503/500 as documented; **does not** send 404. So a **404** means the request **never reached** this handler.  
- **On live:** Unknown from code alone. The **Express app entry point** that mounts routers is **not** in `apps/core/cardbey-core` in this repo (only route files and tests). So either:  
  - The Render deploy is from another repo/app that must mount this router at `/api/mi`, or  
  - The deploy is from this monorepo but the server entry lives elsewhere (e.g. another package).  
- **Conclusion:** On production, the **events route is either not mounted or not deployed**. To fix: ensure the running app has something like `app.use('/api/mi', miIntentsRoutes)` (or the equivalent path where the frontend sends requests).

---

## 7. Local/dev vs production route registration

- **Local:** If you run a server that mounts `miIntentsRoutes` at `/api/mi`, then `GET /api/mi/missions/:missionId/events` works.  
- **Production:** If the Render build does not include that mount (or uses an older build without it), the same URL returns 404.  
- **Recommendation:** In the codebase that **builds** the cardbey-core server, confirm:  
  - `miIntentsRoutes` is imported and mounted at `/api/mi`, and  
  - That code is in the build/deploy used by cardbey-core.onrender.com.

---

## 8. Log search (for live debugging)

On the **cardbey-core** service (and any worker), search logs for:

- **Mission id:** e.g. `mission-1773282287112-10jm7n6` (from URL).  
- **Draft id:** e.g. `cmmn1stk0f804p93wd7p7a6kt` (from UI).  
- **Job id / run id:** from UI.  
- **DRAFT_NOT_FOUND** (if logged by backend).  
- **GET /api/draft-store/.../summary** and **POST /api/draft-store** (to confirm create/summary requests and response status).  
- **GET /api/mi/missions/.../events** (to confirm whether the request hits the app and what path Express sees).

---

## 9. Category of failure

- **Events 404:** **Route/deploy mismatch.** The handler exists in repo; production server does not serve that path (not mounted or not deployed).  
- **DRAFT_NOT_FOUND:** **Persistence/timing or env mismatch.** Either:  
  - Draft never created in production (e.g. create failed or different flow),  
  - **DB mismatch** (different DATABASE_URL between create and read),  
  - **draft-store route missing or wrong path** on live, or  
  - **Timing:** UI shows artifacts from a previous run; current run tries to load a draft that doesn’t exist yet or was never written.

---

## 10. Minimal fix (exact)

**No mission architecture change.** Minimal, safe changes:

### A. Fix events 404 (backend deploy)

1. **Locate** the Express (or similar) app that runs as cardbey-core.onrender.com (may be in another repo or another package).  
2. **Ensure** it mounts the MI intents router at `/api/mi`:
   - Example: `app.use('/api/mi', miIntentsRoutes)` (or `app.use('/api/mi', miIntentsRoutes.router)` if exported differently).  
3. **Ensure** the same app has:
   - `Mission`, `MissionEvent`, `IntentRequest`, and any other models used by `miIntentsRoutes` in its Prisma schema and migrations.  
4. **Redeploy** cardbey-core so the running process includes this mount and schema.  
5. **No frontend change** required for the events URL; frontend already calls `/api/mi/missions/:missionId/events`.

**Files to change (in the repo that contains the server entry):**  
- The single file where routes are mounted (e.g. `app.js`, `server.js`, `index.js`). Add or fix:  
  - `import miIntentsRoutes from '...miIntentsRoutes';` (path to `apps/core/cardbey-core/src/routes/miIntentsRoutes.js` or equivalent)  
  - `app.use('/api/mi', miIntentsRoutes);`  
- If the same app also serves missions (GET /api/missions/:id), ensure `missionsRoutes` is mounted at `/api/missions` (e.g. `app.use('/api/missions', missionsRoutes)`).

### B. Fix DRAFT_NOT_FOUND (backend + env)

1. **Confirm** on Render that the **cardbey-core** service has:
   - **draft-store** routes deployed (e.g. `POST /api/draft-store`, `GET /api/draft-store/:id/summary`, `POST /api/draft-store/:id/generate`).  
2. **Confirm** a single **DATABASE_URL** is used for:
   - Creating drafts (e.g. POST draft-store),  
   - Reading drafts (GET draft-store summary).  
3. **If** the draft is created by a different service (e.g. worker): ensure that service writes to the **same** DB and that cardbey-core reads from it with the same connection.  
4. **Optional defensive check:** In the step that creates the draft (Phase 0), after `postDraftStoreCreate`, verify with a follow-up `getDraftStoreSummary(draftStoreId)` in dev/staging to ensure create and read see the same DB.

**No change to stepHandlers.ts error mapping** (keep 404 → DRAFT_NOT_FOUND). Only fix backend and env so 404 is not returned when the draft actually exists in the same DB.

### C. Frontend (optional, defensive)

- **No change required** for normal fix.  
- If you want to avoid showing “Context ready” when the draft is not yet available, that would be a separate, small UX change (e.g. don’t set artifacts.draftId until summary returns 200); not in scope for this minimal fix.

---

## 11. Files and config

**Files changed (minimal fix):**

- **Backend (repo that runs cardbey-core):**  
  - 1 file: the server entry that mounts routes. Add or fix mount: `app.use('/api/mi', miIntentsRoutes)`.

**Env/config (Render):**

- **cardbey-core service:**  
  - **DATABASE_URL:** Same for all processes that create/read drafts and missions.  
  - No new vars required for the events route if the same app already has Prisma and auth.  
- **Frontend (static site):**  
  - **VITE_CORE_BASE_URL** (or equivalent): must be `https://cardbey-core.onrender.com` (or the correct core URL). Already has fallback in code.

**No code changes in this repo** if the server that mounts routes lives elsewhere. If the server entry is later added to this repo, the only change is the single mount line above.

---

## 12. Manual verification checklist (live)

After deploy:

- [ ] **Events:** From mission page, open DevTools → Network. Reload. `GET https://cardbey-core.onrender.com/api/mi/missions/<missionId>/events?limit=200` returns **200** (or 401/403 if unauthenticated), **not 404**.  
- [ ] **Draft create:** Start a new store mission (Phase 0). After “Draft created”, open Draft Review or trigger a step that calls `getDraftStoreSummary`. No 404; no DRAFT_NOT_FOUND.  
- [ ] **DRAFT_NOT_FOUND:** Run a store mission to the step that fetches draft summary. If draft exists in DB, response is 200 and no DRAFT_NOT_FOUND in UI.  
- [ ] **Same DB:** Create draft in production, then in same session load draft summary; must succeed.  
- [ ] **Logs:** In Render logs for cardbey-core, requests to `/api/mi/missions/.../events` and `/api/draft-store/...` appear and return expected status codes.

---

## 13. Summary table

| Question | Answer |
|----------|--------|
| **Root cause (events 404)** | Events route not mounted or not deployed on live core. |
| **Root cause (DRAFT_NOT_FOUND)** | Draft-store returns 404: draft missing in DB, or wrong DB/env, or draft-store not deployed. |
| **Does draft exist in live DB?** | Unknown; check with same `draftStoreId` via direct DB query or GET summary from a known-good client. |
| **Does events route exist in live deploy?** | Handler exists in repo; production server does not serve it (404 = route not matched). |
| **Exact fix** | Mount MI intents router at `/api/mi` in the app that runs on Render; ensure single DATABASE_URL and draft-store routes deployed. |
| **Render config** | Same DATABASE_URL for all draft/mission access; frontend VITE_CORE_* points to that core URL. |
