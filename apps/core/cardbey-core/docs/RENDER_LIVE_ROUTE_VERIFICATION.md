# Render Live Route Verification

**Purpose:** Verify that cardbey-core.onrender.com has the correct route mounts and DB config so mission execution and draft-store work in production.

---

## Root cause (from audit)

- **GET /api/mi/missions/:missionId/events 404:** The handler exists in `src/routes/miIntentsRoutes.js`. A 404 in production means the **deployed** app did not have this router mounted at `/api/mi` (e.g. stale deploy).
- **DRAFT_NOT_FOUND:** Frontend maps 404 from draft-store APIs to `errorCode: DRAFT_NOT_FOUND`. Draft create/read must use the **same** DATABASE_URL so the draft exists when summary is requested.

---

## Backend status in this repo

| Item | Status |
|------|--------|
| **Server entry** | `src/server.js` |
| **/api/mi** | Mounted: `app.use('/api/mi', miIntentsRoutes)` (line ~470). Serves GET `/missions/:missionId/events`, POST/GET intents, run. |
| **/api/draft-store** | Mounted: `app.use('/api/draft-store', draftStoreRoutes)` (line ~508). Serves POST `/` (create), GET `/:draftId/summary`, POST `/:draftId/generate`, POST `/:draftId/commit`. |
| **/api/store-draft** | Mounted: same `draftStoreRoutes` for Phase 0 compatibility. |
| **/api/missions** | Mounted: `app.use('/api/missions', missionsRoutes)` (line ~520). Serves GET `/:missionId`, etc. |
| **DATABASE_URL** | Single `getPrismaClient()` in `db/prisma.js`; all routes use it. One DB for draft create and read. |

If production still returns 404 for these paths, **redeploy** the cardbey-core service from this repo so the running app includes the current server.js.

---

## Startup diagnostics (after this fix)

On startup (when `ROLE=api`), the server logs:

- `[CORE] Production-critical routes: /api/mi (missions/intents/events), /api/draft-store (create/summary/generate), /api/missions`
- `[CORE] DATABASE_URL: set (single DB for draft create/read)` or `DATABASE_URL: not set`

**Check Render logs** after deploy: if you see these lines, the running code has the correct mounts. If you see 404 for `/api/mi/...` or `/api/draft-store/...`, the deploy may be from an older build.

---

## Post-deploy verification checklist

- [ ] **Events route:** In browser or curl, `GET https://cardbey-core.onrender.com/api/mi/missions/<missionId>/events?limit=200` with valid `Authorization: Bearer <token>`. Expect **200** (with `{ ok: true, events: [...] }`) or **401/403**. **Not 404.**
- [ ] **Draft-store summary:** `GET https://cardbey-core.onrender.com/api/draft-store/<draftStoreId>/summary` with valid auth. Expect **200** (draft exists), **403** (no access), or **404** with body `{ ok: false, error: 'not_found' }` (handler 404). If you get **404** with body `{ error: 'Not found' }` only, the route is **not** mounted (redeploy).
- [ ] **Phase 0 store mission:** Start a new store mission (Phase 0). After "Draft created", open Draft Review or run the next step. No DRAFT_NOT_FOUND; draft loads or shows access denied, not "route not found".
- [ ] **Render logs:** Requests to `/api/mi/missions/.../events` and `/api/draft-store/...` appear with status 200/401/403 (and 404 only from handler for missing draft), not Express 404.
- [ ] **No regression:** Other routes (auth, stores, health, etc.) still respond as before.

---

## Render env (no code change)

- **cardbey-core service:** Set **DATABASE_URL** to the same Postgres (or DB) URL for all instances. Do not use different DBs for "creator" vs "executor"; one DB for draft create and read.
- **Frontend (static site):** **VITE_CORE_BASE_URL** (or equivalent) must point to `https://cardbey-core.onrender.com` (or the live core URL). Already has fallback in code.

---

## Exact files changed (minimal patch)

| File | Change |
|------|--------|
| `src/server.js` | Comments clarifying production-critical mounts for `/api/mi` and `/api/draft-store`. Startup log: `[CORE] Production-critical routes: ...` and `[CORE] DATABASE_URL: set \| not set`. |
| `src/test/e2e/m2-unification-closeout.e2e.test.js` | New describe "Production-critical route mounts" with two tests: (1) GET /api/mi/missions/:id/events returns non-404, (2) GET /api/draft-store/:id/summary not Express 404. |
| `docs/RENDER_LIVE_ROUTE_VERIFICATION.md` | This verification doc. |

No change to mission logic, auth, or draft-store handler behavior. No new env vars required beyond existing DATABASE_URL.
