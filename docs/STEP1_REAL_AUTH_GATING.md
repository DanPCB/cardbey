# Step 1 — Real Auth Gating + Tenant/Store Ownership

## Risk assessment (LOCKED RULE)

- **Workflow spine:** POST /api/mi/orchestra/start → GET /api/stores/temp/draft?generationRunId=... → PATCH /api/draft-store/:draftId → POST /api/store/publish → GET /api/store/:id/preview.
- **What could break:** Unauthenticated users would get 401 where they previously could access (temp draft, PATCH draft-store). Guest tokens still pass requireAuth (backend and frontend); only missing token gets 401. Wrong-user access gets 403; response shapes for 401/403 are additive (ok: false, error, message).
- **Avoided:** No route or query param names changed. No response shape changes for success paths. No new endpoints. GET temp/draft now requires generationRunId when storeId is temp (dashboard always sends it).

---

## Files changed

### Backend (cardbey-core)

| File | Change |
|------|--------|
| `src/lib/draftOwnership.js` | **New.** Helpers `getTaskOwnerByGenerationRunId(generationRunId)`, `isDraftOwnedByUser(generationRunId, userId)` using OrchestratorTask to infer draft ownership. |
| `src/routes/stores.js` | GET `/:storeId/draft`: optionalAuth → requireAuth. For storeId temp: require generationRunId (400 if missing); after resolve runId, tenant check via getTaskOwnerByGenerationRunId, 403 if owner.userId !== req.userId. |
| `src/routes/draftStore.js` | PATCH `/:draftId`: requireAuth; load draft, get generationRunId; isDraftOwnedByUser(runId, req.userId) else 403; if no runId 403. |
| `src/services/draftStore/publishDraftService.js` | After findTargetDraft, for temp store: get runId from targetDraft, isDraftOwnedByUser(runId, userId) else throw PublishDraftError(403). |

### Frontend (dashboard)

| File | Change |
|------|--------|
| `src/App.jsx` | Wrapped `/app/store/:storeId/review` and `/app/store/:storeId/publish-review` in existing `<RequireAuth>` so unauthenticated users are redirected to `/login?returnTo=<encoded full URL>`. Full URL preserves jobId, generationRunId, cat, step. |

### Docs

| File | Change |
|------|--------|
| `docs/STEP1_REAL_AUTH_GATING.md` | This file. |

---

## Exact code changes (summary)

1. **draftOwnership.js**  
   - `getTaskOwnerByGenerationRunId`: find OrchestratorTask with `request.generationRunId === runId`, return `{ userId, tenantId }` or null.  
   - `isDraftOwnedByUser(runId, userId)`: if no task return true (legacy); else return task.userId === userId.

2. **stores.js**  
   - GET `/:storeId/draft`: middleware optionalAuth → requireAuth.  
   - Temp branch: runId = generationRunId (trimmed); if !runId return 400 with error generationRunId_required.  
   - If runId: owner = getTaskOwnerByGenerationRunId(runId); if owner && owner.userId !== req.userId return 403.

3. **draftStore.js**  
   - Import requireAuth, isDraftOwnedByUser.  
   - PATCH `/:draftId`: requireAuth; get draft by draftId; runId = draft.generationRunId or from input; if runId then isDraftOwnedByUser else 403; then patchDraftPreview.

4. **publishDraftService.js**  
   - After findTargetDraft, if isTempStore and targetDraft has runId: isDraftOwnedByUser(runId, userId) or throw PublishDraftError(403).

5. **App.jsx**  
   - Route `/app/store/:storeId/review` element: `<RequireAuth><StoreReviewPage /></RequireAuth>`.  
   - Route `/app/store/:storeId/publish-review` element: `<RequireAuth><StorePublishReviewPage /></RequireAuth>`.

---

## Manual verification checklist

1. **Logged out → 401**
   - Clear tokens / use incognito. Open `/app/store/temp/review?mode=draft&jobId=xxx&generationRunId=yyy`.
   - Expect redirect to `/login?returnTo=...` (full URL encoded).
   - Call GET `/api/stores/temp/draft?generationRunId=yyy` with no Authorization → 401.
   - Call PATCH `/api/draft-store/:draftId` with no Authorization → 401.
   - Call POST `/api/store/publish` with no Authorization → 401.
   - POST `/api/mi/orchestra/start` with no Authorization → 401.

2. **Logged in → same user**
   - Log in, create store (orchestra/start) → get jobId + generationRunId. Open review URL with that jobId/generationRunId.
   - GET temp/draft and PATCH draft-store and POST store/publish with same user’s token → 200 (or expected success).

3. **Wrong tenant → 403**
   - User A creates job (orchestra/start), gets generationRunId. User B (different account) with valid token:
     - GET `/api/stores/temp/draft?generationRunId=<A’s runId>` → 403.
     - PATCH draft-store with A’s draftId (if B knows it) → 403.
     - POST `/api/store/publish` with storeId temp and A’s generationRunId → 403.

4. **After login → resume**
   - Logged out, open `/app/store/temp/review?mode=draft&jobId=J&generationRunId=G&cat=other&step=publish`.
   - Redirect to login with returnTo encoding that full path. Log in.
   - Expect redirect back to same URL (jobId, generationRunId, cat, step preserved).

5. **No breaking changes**
   - Flow order unchanged: start → draft → patch → publish → preview.
   - Success response shapes unchanged. Query param names unchanged (jobId, generationRunId, cat, step). No new endpoints.

---

## Auth utilities reused

- **Backend:** `requireAuth` from `../middleware/auth.js` (already used by POST /orchestra/start and POST /store/publish). No new middleware.
- **Frontend:** Existing `RequireAuth` in App.jsx (useSession + role), redirect to `/login?returnTo=...`. LoginPage already reads `returnTo` and redirects after login. No new guard component.

---

## Tenant ownership rules

- **Drafts:** Ownership inferred via OrchestratorTask: task.request.generationRunId matches draft’s generationRunId, task.userId is the owner. DraftStore has no userId column; no schema change.
- **GET temp/draft:** Require auth; require generationRunId for temp; allow only if task owner userId === req.userId.
- **PATCH draft-store:** Require auth; allow only if draft has generationRunId and isDraftOwnedByUser(runId, req.userId).
- **Publish:** Require auth (existing); for temp, allow only if target draft is owned by userId (same helper).
