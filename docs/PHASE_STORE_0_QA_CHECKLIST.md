# Store Mission Phase 0 – QA Checklist

## Overview
Phase 0 adds: Create DraftStore (validate-context) → Generate store content (execute-tasks) → Report placeholder. No commit/publish. Artifact-gated PhaseOutputs show draft summary and counts.

---

## 0. Plan classification (store vs campaign)

“My store” is treated as context only. **Campaign intent** (campaign, promotion, marketing, ads, schedule, post, content plan, launch) takes priority. **Store** is chosen only when the prompt has explicit store-creation verbs (create/build/generate/make + store/storefront/online store). When both intents appear: prefer **campaign** unless the phrase implies store first (e.g. “create store first”, “create store then run”).

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create mission with prompt: **"plan and execute a promotion campaign for my store in 1 month"** | Plan type is **campaign**; steps: Validate campaign scope, Create campaign, Campaign report. **Confirm & Run** allowed (no store-input form). |
| 2 | Create mission with prompt: **"create an online store for my ABC beauty service"** | Plan type is **store**; steps: Validate store context, Generate store assets, Store report. Store input (business name/type/location) shown. |
| 3 | Create mission with prompt: **"run 2 week promotion campaign for my new bakery"** | Plan type is **campaign**. |
| 4 | Create mission with prompt: **"create store and run campaign"** | Plan type is **campaign** (both intents; prefer campaign when no store-first phrase). |
| 5 | Create mission with prompt: **"create store then run a campaign"** | Plan type is **store** (store-first phrase). |

Unit tests: `pnpm run test:plan` in dashboard (`planGenerator.test.ts`).

---

## Prerequisites
- Backend and dashboard running; user signed in.
- Prisma: `npx prisma generate --schema prisma/sqlite/schema.prisma` and `npx prisma db push` from `apps/core/cardbey-core`.
- Optional: `VITE_MISSION_STORE_PHASE0=true` (default) to enable store Phase 0 in Execution panel. Set to `false` to hide store mission PhaseOutputs.

---

## 1. Create store mission from app

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Mission Console; create mission with prompt: "Create a store for French Baguette cafe" | Plan type is **store**; steps: Validate store context, Generate store assets, Store report. |
| 2 | Confirm & Run | Execution starts; validate-context runs first. |

---

## 2. Validate step (create draft)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Wait for validate-context to complete | Step completes; no 404/500. |
| 2 | Check mission artifacts (e.g. in Redux/localStorage or debug) | `artifacts.draftStoreId` and `artifacts.draftId` set to same DraftStore id. |
| 3 | Check backend | DraftStore row exists: status `draft`, input has businessName/category/missionId, ownerUserId set. |
| 4 | PhaseOutputs for "Validate store context" | When draftStoreId exists: shows draft id + status (e.g. "draft"). No "No outputs yet" once artifact is set. |

---

## 3. Generate step

| Step | Action | Expected |
|------|--------|----------|
| 1 | Wait for execute-tasks to complete | Step runs POST /api/draft-store/:draftStoreId/generate; DraftStore status moves to `generating` then `ready` (or `failed`). |
| 2 | PhaseOutputs for "Generate store assets" | Shows status chip (generating/ready/failed), productCount, categoryCount, imageCount. If missingImagesCount > 0, warning shown. **Refresh status** button re-fetches summary (no full rerun). |
| 3 | No publish/commit | No storeId created; no commit step. |
| 4 | If polling times out (e.g. 60s) while status is still `generating` | Step completes with **ok** (mission not failed). Report shows "Still generating—check back shortly." User can click **Refresh status** in PhaseOutputs to re-check; mission stays completed. |

---

## 3b. Job completed → summary refresh; no polling storms

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start store mission (orchestra/start with jobId). Watch network tab for GET /api/mi/orchestra/job/:jobId | At most **1 request per 2–5s** (throttled). No tight loop. |
| 2 | When backend reports job status `completed` | Job polling **stops immediately**. One GET /api/draft-store/:draftId/summary is triggered. |
| 3 | If summary.status === `ready` (or draft has content) | Store generate step marks **completed**; mission progresses. |
| 4 | If summary.status still `generating` after that single refresh | Step still **completes** (mission not failed). Report shows "Finalizing… Use Refresh status to re-check." User uses **Refresh status** (single re-fetch), not Retry validation. |
| 5 | Retry validation | Used only for **genuine re-validation** (new run). Not used as a status refresh; use **Refresh status** for that. |

---

## 4. Report step

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open "Store report" step | PhaseOutputs shows placeholder: "Next: publish (Phase 1)." |
| 2 | No API call for report | No POST report; no storeId. |

---

## 5. Auth

| Step | Action | Expected |
|------|--------|----------|
| 1 | POST /api/draft-store (create) without token | 401 Unauthorized. |
| 2 | POST /api/draft-store/:id/generate without token | 401 Unauthorized. |
| 3 | GET /api/draft-store/:id/summary without token | 401 Unauthorized. |
| 4 | GET summary for draft owned by another user | 403 Forbidden (or 404). |

---

## 5b. Summary endpoint authorization (manual QA)

Ownership is resolved by single helper **canAccessDraftStore**: **super_admin** → **draft.ownerUserId** → **draft tenant** (draft.input.tenantId === tenantKey) → **OrchestratorTask** (generationRunId) → **store** (Business.userId). **ownerUserId** must be the actual user id (user.id); **tenantKey** = getTenantId(user) (business id or user id). DraftStore has no tenantKey column; tenant is taken from draft.input.tenantId.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create store mission Phase 0 (validate completes); as same user, GET /api/draft-store/:draftStoreId/summary with that user’s token | **200** and summary JSON (draftStoreId, status, productCount, etc.). |
| 2 | As a **different** user (or unauthenticated), GET summary for the same draftStoreId | **403** Forbidden (or 401 if no token). |
| 3 | As **super_admin** (or admin with hasRole bypass), GET summary for any draft | **200** and summary JSON. |
| 4 | Orchestra-created draft (jobId/generationRunId): user who started the job GET summary | **200** (ownership via task or draft.ownerUserId when set). |
| 5 | When access is denied, non-production logs show `[DraftStore] GET /:draftId/summary denied` with draftId, userId, tenantKey, draftOwnerUserId, draftTenantKey, draftStoreId, generationRunId, storeId (no secrets). |

---

## 5c. Owner vs non-owner (Store Phase 0)

| Step | Action | Expected |
|------|--------|----------|
| 1 | **As John:** Run Store mission Phase 0 (validate → generate). | validate step creates draftStoreId; generate step triggers generation; GET summary returns **200**; PhaseOutputs shows status + productCount/categoryCount. |
| 2 | **As Jane:** Using the same draftStoreId from John's mission, GET /api/draft-store/:draftStoreId/summary with Jane's token. | **403** Forbidden. |
| 3 | **As Jane:** POST /api/draft-store/:draftStoreId/generate with John's draftId. | **403** Forbidden. |
| 4 | Mission step errors: 403 on summary/generate → errorCode **ACCESS_DENIED**; 404 → **DRAFT_NOT_FOUND** (not DRAFT_ID_UNRESOLVED for 403). |

---

## 5d. Orchestra/start and ownerUserId

Drafts created via **POST /api/mi/orchestra/start** (Quick Start, build_store) now set **ownerUserId** to the requesting user so summary/generate return 200 for the same user.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start a **new** store via Quick Start (or any flow that calls orchestra/start) as John. | Draft is created with ownerUserId = John's id. |
| 2 | As John, GET /api/draft-store/:draftId/summary for that draft. | **200** and summary JSON. |
| 3 | As Jane, GET summary for the same draft. | **403** Forbidden. |

**Note:** Old drafts created before this fix may have ownerUserId = null; they remain accessible only via OrchestratorTask ownership (generationRunId) or store ownership. Optionally run a one-time backfill script to set ownerUserId from the task's userId for drafts where ownerUserId is null and a matching task exists (run with care; see docs).

---

## 5e. Store-draft 404 / DRAFT_ID_UNRESOLVED (Phase 0 critical path)

Phase 0 **canonical APIs only:** GET `/api/draft-store/:id/summary`, POST `/api/draft-store/:id/generate`, (optional) GET `/api/draft-store/:id`. The path `/api/store-draft/:id` is **not** part of Phase 0; legacy UI may call it.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run Store mission Phase 0 (validate → generate). | Mission **completes** (success/ready or ready with warnings). No **DRAFT_ID_UNRESOLVED** when the draft exists and GET `/api/draft-store/:id/summary` returns 200. |
| 2 | PhaseOutputs after generate | Shows summary counts (productCount, categoryCount, etc.) and transitions to ready. |
| 3 | Backend alias (optional) | GET `/api/store-draft/:id` (with auth) returns **200** with same body as GET `/api/draft-store/:id` (compatibility). If not implemented, 404 from store-draft is non-fatal (STORE_DRAFT_404 → DRAFT_NOT_AVAILABLE, dev-only log). |

**Error mapping (mission/UI):** Only 404 from **draft-store** (GET `/api/draft-store/:id/summary`) is treated as **DRAFT_NOT_FOUND**. 404 from GET `/api/store-draft/:id` returns error code **STORE_DRAFT_404** and is **non-fatal**: mission does not show DRAFT_ID_UNRESOLVED; step handler returns DRAFT_NOT_AVAILABLE and logs dev-only. **Mission critical path:** ConsoleContext `fetchStoreDraft` tries GET `/api/draft-store/:id/summary` first; only on other errors falls back to GET `/api/store-draft/:id`. PhaseOutputs and Phase 0 steps use only draft-store (summary, generate).

---

## 5f. Generating timeout (non-fatal)

When execute-tasks polls summary for up to 60s and status remains `generating`, the step **does not fail**. The handler returns **ok: true** with a report patch so the mission completes and the user can re-check later.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run Store mission Phase 0 with slow generation (e.g. image generation delayed). | Execute-tasks step shows generating state; after 60s timeout, step is marked **completed** (not failed). Mission status **completed**. |
| 2 | PhaseOutputs for "Generate store assets" | Shows status **generating** with counts and missingImagesCount when applicable. **Refresh status** button visible; click re-fetches GET summary (no full mission rerun). |
| 3 | After some time or after clicking Refresh status | Summary returns status `ready`; PhaseOutputs updates to show product/category counts. Mission is not marked failed solely due to generating timeout; only explicit `failed` or unrecoverable errors fail the mission. |

---

## 5g. Image generation billing limit (non-fatal)

When OpenAI returns a billing/quota error (e.g. "Billing hard limit has been reached"), the image loop stops early. Remaining items keep no image (or null); draft is still finalized as **ready**. Summary exposes **imageCount**, **missingImagesCount**, **heroImageUrl** (with hero fallback to seed if needed). PhaseOutputs shows **Ready with warnings** when status is ready and missingImagesCount > 0.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Simulate billing hard limit (e.g. exhaust OpenAI quota or mock 429/insufficient_quota in openaiImageService). Run Store mission Phase 0 (validate → generate). | Draft becomes **ready** (not failed). Some items have images; remaining items have no imageUrl. missingImagesCount > 0. |
| 2 | GET /api/draft-store/:draftId/summary | **200** with imageCount, missingImagesCount, heroImageUrl (or placeholder from seed). |
| 3 | PhaseOutputs for "Generate store assets" | Shows **Ready with warnings** chip when status is ready and missingImagesCount > 0. Expanded view shows product/category counts and "· N missing". |
| 4 | Mission status | Mission **completes** (no failure). User can refresh or proceed; UX is not broken. |

---

## 6. Example curl calls

Replace `BASE`, `TOKEN`, `DRAFT_STORE_ID` with real values.

**Create draft (Store Phase 0)**

```bash
curl -s -X POST "BASE/api/draft-store" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"French Baguette cafe","category":"cafe","missionId":"optional-mission-id"}'
```

Expected: `201` with `{ "ok": true, "draftStoreId": "...", "status": "draft" }`.

**Generate draft**

```bash
curl -s -X POST "BASE/api/draft-store/DRAFT_STORE_ID/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{}'
```

Expected: `200` with `{ "ok": true, "draftStoreId": "...", "status": "ready" }` (or `202` if generating).

**Summary (for PhaseOutputs)**

```bash
curl -s "BASE/api/draft-store/DRAFT_STORE_ID/summary" \
  -H "Authorization: Bearer TOKEN"
```

Expected: `200` with `{ "ok": true, "draftStoreId": "...", "status": "...", "businessName": "...", "category": "...", "productCount": N, "categoryCount": N, "imageCount": N, "missingImagesCount": N?, "updatedAt": "..." }`.

---

## 7. Rollback

- Set `VITE_MISSION_STORE_PHASE0=false` in dashboard env to hide store mission PhaseOutputs in Execution panel. Backend routes remain; only UI hides store phase blocks.
- To fully disable store mission type from plan generation, adjust planGenerator (out of scope for Phase 0).

---

## 8. Files changed (reference)

- **Backend:** `apps/core/cardbey-core/src/lib/draftOwnership.js` (canAccessDraftStore: allow ownerUserId **or** draft.input.tenantId === tenantKey; draftOwnershipFieldsForLog includes draftTenantKey), `apps/core/cardbey-core/src/lib/tenant.js` (getTenantId used by draft routes), `apps/core/cardbey-core/src/routes/draftStore.js` (pass tenantKey into canAccessDraftStore; deny logs: draftId, userId, tenantKey, draftOwnerUserId, draftTenantKey; import getTenantId), `apps/core/cardbey-core/src/routes/miRoutes.js` (orchestra/start: **ownerUserId = req.userId ?? null** only; do not set ownerUserId to finalTenantId), `apps/core/cardbey-core/src/server.js` (alias: `app.use('/api/store-draft', draftStoreRoutes)` so GET /api/store-draft/:id works; Phase 0 no longer fails on store-draft 404 / DRAFT_ID_UNRESOLVED).
- **Rule:** ownerUserId must be user.id; tenantKey (from getTenantId(user)) is business id or user id; access allows owner match **or** tenant match.
- **Dashboard:** `missionStore.ts` (MissionReport.generatingDraftStoreId), `ConsoleContext.tsx`, `stepHandlers.ts`, `PhaseOutputs.tsx` (store_generate: generating chip, **Ready with warnings** when ready and missingImagesCount > 0, counts, **Refresh status** button), `ExecutionDrawer.tsx`.
- **Core (billing non-fatal):** `services/menuVisualAgent/openaiImageService.ts` (billing/quota error → throw BILLING_HARD_LIMIT), `services/menuVisualAgent/menuVisualAgent.ts` (rethrow BILLING_HARD_LIMIT from generateImageForDraftItem), `services/draftStore/draftStoreService.js` (finalizeDraft: detect BILLING_HARD_LIMIT in settled, stop image loop early; draft still finalizes ready). Summary in `routes/draftStore.js` already exposes imageCount, missingImagesCount, heroImageUrl.
- **Docs:** `docs/IMPACT_REPORT_STORE_MISSION_PHASE0.md`, `docs/IMPACT_REPORT_DRAFT_STORE_ACCESS.md`, `docs/STORE_PIPELINE_INTEGRATION_PHASE0.md`, `docs/PHASE_STORE_0_QA_CHECKLIST.md`.
