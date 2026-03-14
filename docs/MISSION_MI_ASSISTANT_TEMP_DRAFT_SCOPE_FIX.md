# MI Assistant Temp Draft Scope — Root Cause & Fix

**Goal:** Allow MI Assistant to work on temp guest draft review (`/app/store/temp/review?mode=draft&jobId=...`) using guest/draft context only, without requiring real store ownership. Publish/claim auth boundary remains intact.

---

## 1. Root cause of the 403

### Where the 403 comes from (in this repo)

| What | Where |
|------|--------|
| **Observed** | UI shows "403 Forbidden You do not have access to this store"; logs show POST /api/chat/resolve-scope and GET /api/mi/missions/:missionId/events returning 403. |
| **In-repo flow** | The dashboard does **not** call `POST /api/chat/resolve-scope`. The flow that produces "no access" on draft review is in the **MI executor** (RealExecutor). |
| **File** | `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` |
| **Exact checks that caused 403** | 1) **GET /api/auth/me** — if the response is **403**, the executor returns a generic "Forbidden" and stops. 2) **GET /api/draft-store/by-store/temp** — for temp draft review, context has `storeId: 'temp'` and `generationRunId`/jobId; the code took the **storeId** branch and called **by-store/temp**, which can 403 (no real store "temp") or fail. So the 403 could be from **auth/me** (guest not "real" user) or from **by-store/temp** (backend rejecting storeId=temp). |

### resolve-scope and mission events

- **POST /api/chat/resolve-scope:** Referenced in some docs (e.g. chatScopeRoutes) but **no implementation or caller** was found in this repo. The 403 the user sees may come from another service or from the executor path above; the in-repo fix is the executor change.
- **GET /api/mi/missions/:missionId/events:** Documented as having requireAuth and mission-owner check in intent routes; **that route was not found** in this repo (only `miRoutes.js` under `apps/core/cardbey-core/src/routes`). The events 403 likely needs to be fixed in the service that actually implements that endpoint (another app/package), if the UI needs events for guest missions.

---

## 2. Smallest safe fix (temp guest draft scope)

### Files changed

- **`apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts`** (executor)
- **`apps/core/cardbey-core/src/routes/miRoutes.js`** (backend route)

### Backend: GET /api/mi/stores/temp/draft (new)

- **Route:** `GET /api/mi/stores/temp/draft?generationRunId=...`
- **Auth:** `optionalAuth` — no 401 for guest; draft is identified by `generationRunId` from the orchestra job.
- **Behavior:** Looks up draft via `getDraftByGenerationRunId(generationRunId)`; returns 200 with `{ ok, draftId, id, draft }` or 404 if not found. No store ownership check.

### Executor changes

1. **Temp draft context detection**  
   - **`isTempDraftContext(ctx)`:** `true` when `ctx.storeId === 'temp'` and `ctx.generationRunId` or `ctx.jobId` is set.

2. **Temp draft guest scope (no auth/me, no by-store/temp)**  
   - When **tempDraftContext && generationRunId**, the executor **first** calls **GET /api/mi/stores/temp/draft?generationRunId=...** (implemented in this repo).  
   - If that returns **200** and a valid draft payload, it sets `effectiveDraftId` and `draftRaw` and **skips** both the auth/me check and the by-store/temp path for that run.  
   - Only when scope was **not** resolved by this temp path does it run auth/me and the rest of draft resolution (draftId → storeId → generationRunId).

3. **Never call by-store for storeId=temp**  
   - In the "else if (storeId)" branch, condition **`storeId !== 'temp'`** so we never call **/api/draft-store/by-store/temp**. Temp draft is resolved only via **/api/mi/stores/temp/draft**.

4. **generationRunId fallback**  
   - The "else if (generationRunId)" block now runs only when **`!effectiveDraftId`** (so we don’t double-fetch after temp path).

5. **lastStatus fix**  
   - Use `httpStatuses[...] ?? 200` for `lastStatus` when the temp draft path is taken (auth not called).

### Allowed assistant actions in temp draft scope (unchanged)

- The executor already allows draft-level write intents when the gate is on: **tags**, **rewrite**, **hero**.  
- These are allowed with **effectiveDraftId** from the temp draft response; no real store ownership is required.  
- Creating a promotion mission from this draft context is a separate flow (e.g. promo/from-draft), which remains auth-protected; this fix does not change that.

---

## 3. Mission events 403

- **Must it be fixed?** Only if the UI needs to load mission events for guest-created missions on the temp draft review page.  
- **In this repo:** The implementation of **GET /api/mi/missions/:missionId/events** was not found; it may live in another service.  
- **If you implement it:** Allow access when the mission belongs to the current guest (e.g. same userId or OrchestratorTask ownership / jobId tied to guest session). Apply the smallest safe change (e.g. optionalAuth + owner-or-guest check by mission/job).

---

## 4. Backend (in-repo) and remaining requirements

- **In-repo:** **GET /api/mi/stores/temp/draft?generationRunId=...** is implemented in `apps/core/cardbey-core/src/routes/miRoutes.js` with **optionalAuth**; it returns 200 with draft payload when the draft exists. No store ownership check.  
- **PATCH draft:** After scope is resolved, the executor calls **PATCH /api/draft-store/:draftId** for tags/rewrite/hero. That route (if in another service) must allow the guest to PATCH when the draft is the one just resolved (e.g. by draft ownership or session). If it lives in this repo, ensure it allows PATCH for the draft owner/session.

---

## 5. Publish boundary preserved

- Temp draft assistant access is for **editing/improvement only** (tags, rewrite, hero on the draft).  
- **Publishing** and **ownership/claim** actions remain auth-protected as before; no changes to those flows.

---

## 6. Manual verification checklist

- [ ] Open **/app/store/temp/review?mode=draft&jobId=...** as a **guest** (no real sign-in), with a valid jobId from a guest-created build-store mission.
- [ ] Confirm the page loads and **Suggestions** tab works.
- [ ] Open **MI Assistant / Agent Mode** and run a draft-scoped action (e.g. "generate tags", "rewrite descriptions", "change hero").
- [ ] **Expected:** No 403; assistant operates in limited draft scope (tags/rewrite/hero succeed when gates are on).
- [ ] **Expected:** Executor no longer 403s for this temp guest draft context (calls GET /api/mi/stores/temp/draft first; skips auth/me and by-store/temp).
- [ ] If the UI loads mission events for the current mission: confirm **GET /api/mi/missions/:missionId/events** does not 403 for the guest-owned mission (fix in the service that implements this route if needed).
- [ ] Confirm **publish/claim** still requires sign-in and is not weakened.

---

## Summary

| Item | Result |
|------|--------|
| **Exact root cause of 403** | Executor called auth/me (403 for guest) and/or draft-store/by-store/temp (403 or failure); no resolve-scope handler found in repo. |
| **Exact file/checks** | `miExecutor.ts`: auth/me 403 and/or by-store/temp for storeId=temp. |
| **Smallest safe fix** | (1) New route GET /api/mi/stores/temp/draft in `miRoutes.js` with optionalAuth; (2) Executor in `miExecutor.ts`: resolve via that URL first when storeId=temp and generationRunId present; skip auth/me and by-store/temp; never call by-store for storeId=temp. |
| **Mission events 403** | Fix only if UI needs events for guest missions; implementation not in this repo — add guest/session ownership check where the route is implemented. |
| **Verification** | Use checklist above; backend GET /api/mi/stores/temp/draft is in-repo and allows guest by generationRunId. |
