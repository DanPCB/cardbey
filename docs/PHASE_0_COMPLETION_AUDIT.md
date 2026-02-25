# PHASE 0 COMPLETION AUDIT — CARDbey

**Date:** 2026-02-24  
**Scope:** System stability audit before MI v1. No new features.  
**Goal:** Structured report of what remains incomplete or unstable for Phase 0.

---

## Phase 0 Definition (Checklist)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Guest-first store creation works end-to-end | Partially stable |
| 2 | Draft → ready → publish flow stable | Partially stable |
| 3 | Image pipeline consistent (no cross-vertical leaks) | Partially stable |
| 4 | Repair + autofix deterministic | Partially stable |
| 5 | QA agent deterministic + persisted | **Broken** |
| 6 | GET temp draft returns full preview (including catalog if stored) | Stable |
| 7 | Notifications endpoint stable (no 500) | Partially stable |
| 8 | No duplicate workflows triggered | Partially stable |
| 9 | No critical 409/500 errors during normal draft review | Partially stable |
| 10 | Auth gating only on commit actions (publish/manage), not on review | Stable |

---

## A) Store Creation Flow Audit

### Trace: create → generateDraft → finalizeDraft → GET temp draft → review page

| Step | File | Function | Status |
|------|------|----------|--------|
| Create | `apps/core/cardbey-core/src/routes/miRoutes.js` | POST `/api/mi/orchestra/start` | ✅ |
| Generate | `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | `runBuildStoreJob` → `generateDraft` | ✅ |
| Finalize | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `finalizeDraft` (lines 201–300) | ✅ |
| GET temp draft | `apps/core/cardbey-core/src/routes/publicStoreRoutes.js` | GET `/api/public/store/temp/draft?generationRunId=` | ✅ |
| Review page | `apps/dashboard/.../StoreReviewPage.tsx` | Uses `/public/store/temp/draft` when guest | ✅ |

### Findings

**Stable:**
- `StoreReviewGate` allows `storeId === 'temp'` without auth (`App.jsx` line 278–281).
- Public draft endpoint `/api/public/store/temp/draft` has no auth; guests use it when `!isLoggedIn`.
- `resolveDraftForStore` returns `products` and `categories` from `preview.items` and `preview.categories`.

**Partially Stable:**
- **Auth split:** `GET /api/stores/:storeId/draft` uses `requireAuth`; guests use `/api/public/store/temp/draft`. Correct, but two paths to maintain.
- **Race:** `draftResolver` returns `status: 'generating'` when no row exists yet; UI polls. No explicit double-transition protection.

**Recommendation:** None blocking. Document the two draft endpoints (auth vs public) for maintainability.

---

## B) Image System Audit

### Findings

**Partially Stable:**
- **Florist required-keyword:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/guards.ts` line 76: `florist: { requiredTermsAny: [] }` — **no required-keyword enforcement** for florist.
- **Repair vs UI:** `assignImagesToDraft` uses `draftForDay2Assign` (baseDraft + patch); same catalog as UI. Repair scans `catalog.products` and `preview.items`. ✅
- **Checked count:** `assignImagesToDraft` returns `filledCount`, `repairedCount`; union logic exists. No explicit unionCount vs checked mismatch in code.

**Broken:**
- **Wrong-image detection:** `DRAFT_GENERATION_MISMATCH_PHASE0.md` states `assignImagesToDraft` was a stub; it is now implemented in `assignImages.ts` with `passesVerticalGuard`, `isBlockedCandidate`. **Needs verification** that it behaves correctly end-to-end.

**Duplicate image loops:** No obvious infinite regeneration loop in `assignImagesToDraft` or `handleRepairWrongImages`; both are single-pass with PATCH then `onRefresh`.

### Recommended Fixes

| Issue | File | Fix |
|-------|------|-----|
| Florist required-keyword | `guards.ts` | Add `requiredTermsAny: ['flower','florist','bouquet','plant']` for florist vertical. |
| Verify repair vs UI item list | Manual test | Confirm `draftForDay2Assign` includes all products shown in grid. |

---

## C) QA Agent Audit

### Findings — **BROKEN**

| Requirement | Status | Location |
|-------------|--------|----------|
| runDraftQa after finalizeDraft | ❌ Not implemented | No call in `draftStoreService.js` |
| runDraftQa after repair | ❌ Not implemented | No call in repair/assignImages flow |
| runDraftQa in sweep | ⚠️ Stub | `runQaSweep.js` is **empty** |
| qaReport persisted in preview.meta | ❌ Not implemented | No qaReport in draft preview schema |
| GET temp draft returns qaReport | ❌ N/A | qaReport never written |

**Files:**
- `apps/core/cardbey-core/src/services/qa/runQaSweep.js` — **empty file**
- `apps/core/cardbey-core/src/services/qa/qaSweepScheduler.js` — calls `runQaSweep`, which does nothing

### Recommended Fixes

| Priority | Fix |
|----------|-----|
| P0 | Implement `runQaSweep` (or remove scheduler if QA not in Phase 0 scope). |
| P1 | Add `runDraftQa` after `finalizeDraft` and after repair; persist `qaReport` in `preview.meta`. |
| P2 | Include `qaReport` in GET temp draft response when present. |

---

## D) Autofix Audit

### Trace: "Fix automatically" / Power Fix path

| Step | Location | Actual behavior |
|------|----------|-----------------|
| UI trigger | `ImproveDropdown.tsx` | "Power Fix images" → `onPowerFix()` (not orchestra) |
| Pre-check | `StoreDraftReview.tsx` ~5309 | `gatekeeper.requireAccount` + `effectiveStoreId`/`effectiveTenantId` required |
| Confirm | `StoreDraftReview.tsx` ~6338 | `apiPOST('/api/mi/orchestra/start', { entryPoint: 'fix_catalog', ... })` |
| Backend | `miRoutes.js` ~1825 | `MI_DRAFT_GOALS` **does not include** `fix_catalog` |
| Run handler | `miRoutes.js` ~1957 | Falls to `else` → job marked `completed` with `notImplemented: true` |

**Backend calls triggered:** One `POST /api/mi/orchestra/start`, one `POST /api/mi/orchestra/job/:id/run` (via poll/run), then job "completes" with no real work.

### Findings

**Broken:**
1. **fix_catalog has no backend handler** — `MI_DRAFT_GOALS` omits `fix_catalog`; job completes immediately with `notImplemented: true`. Power Fix does nothing.
2. **Power Fix blocked for temp drafts** — `onPowerFix` requires `effectiveStoreId` and `effectiveTenantId`. For temp, `effectiveTenantId` is often missing → toast "Store ID and Tenant ID are required" and `setFinishSetupOpen(true)` instead of opening the confirm modal.

**Repair (separate from Power Fix):**
- "Repair wrong images" calls `handleRepairWrongImages` → `assignImagesToDraft(..., { repairOnly: true })` → PATCH draft. One cycle per click. ✅

### Recommended Fixes

| Issue | File | Fix |
|-------|------|-----|
| fix_catalog not in MI_DRAFT_GOALS | `miRoutes.js` ~1825 | Add `'fix_catalog'` and implement handler that runs repair/assign logic (or delegates to existing repair). |
| Power Fix blocked for temp | `StoreDraftReview.tsx` ~5309 | For `storeId === 'temp'`, allow Power Fix without `effectiveTenantId`; use `generationRunId` for ownership. |

---

## E) Notifications Audit

### Handler location
- `apps/core/cardbey-core/src/routes/notifications.js`

### Findings

**Stable:**
- `optionalAuth` + `guestSessionId` on both GET and POST.
- When no `userId` and no `guestSessionId`: returns `200 { ok: true, notifications: [] }` (lines 27–29).
- `Notification` model exists in Prisma (schema line 1343).

**Partially Stable / 500 risk:**
- 500 likely causes: (1) `Notification` table missing (migration not run), (2) Prisma client/connection error, (3) cookie parsing if `guestSessionId` depends on cookies and middleware order is wrong.
- `guestSessionId` creates cookie when missing; `userId = 'guest_' + guestSessionId` used for query. Logic is sound.

### Recommended Fixes

| Priority | Fix |
|----------|-----|
| P1 | Ensure `prisma migrate deploy` has been run so `Notification` table exists. |
| P2 | Add try/catch with specific handling for "table does not exist" and return 200 `[]` as fallback. |

---

## F) Auth Audit

### Findings — **Stable**

| Check | Status | Location |
|-------|--------|----------|
| Review page guest accessible | ✅ | `StoreReviewGate`: `storeId === 'temp'` → no `RequireAuth` |
| Publish requires auth | ✅ | `POST /api/stores/publish` uses `requireAuth` |
| Manage after publish requires verified email | ✅ | Gatekeeper / `requireAccount` on commit actions |
| Temp routes requireAuth misuse | ✅ | `GET /api/stores/temp/draft` uses `requireAuth` but guests use `/api/public/store/temp/draft` instead |

**Note:** `GET /api/stores/:storeId/draft` with `storeId=temp` uses `requireAuth` and `isDraftOwnedByUser`. Authenticated users use this path; guests correctly use the public route.

---

## G) Orchestration / Workflow Duplication

### Routes hitting `/api/mi/orchestra/job`

| Consumer | File | Behavior |
|----------|------|----------|
| `useOrchestraJobUnified` | `useOrchestraJobUnified.ts` | Polls GET `/api/mi/orchestra/job/:jobId` |
| `StoreDraftReview` | Can use parent-provided job state to avoid duplicate GET | ✅ |
| `StoreReviewPage` | Provides job state to `StoreDraftReview` | ✅ |
| `useJobPoll` | `useJobPoll.ts` | Also polls job endpoint |
| `orchestraClient` | `orchestraClient.ts` | GET job, POST run |

**Findings:**
- `useOrchestraJobUnified` has in-flight deduplication to avoid burst of GET requests.
- `StoreDraftReview` accepts parent job state to prevent duplicate polling.
- No background sweep triggers store creation; QA sweep is disabled by default and `runQaSweep` is empty.

**Partially Stable:**
- Multiple call sites can still cause duplicate requests if not wired to shared state. Existing docs (`POLLING_EVERY_MINUTE_FIX.md`, etc.) describe past bursts.

---

## Summary by Category

### Stable
- Store creation pipeline (create → generate → finalize).
- GET temp draft returns full preview (products, categories, draft).
- Public draft route for guests.
- Auth: review page guest-accessible; publish requires auth.
- Repair wrong images: single cycle, no loop.

### Partially Stable
- Image pipeline: florist has no required-keyword; repair needs verification.
- Notifications: logic correct; 500 possible if migration/Prisma issue.
- Orchestration: potential duplicate GETs; some mitigations in place.
- Draft status transitions: no explicit double-transition guard.

### Broken
- **QA agent:** `runQaSweep.js` empty; no runDraftQa, no qaReport in preview.
- **Power Fix (fix_catalog):** No backend handler; job completes with `notImplemented: true`.
- **Power Fix for temp:** Blocked by `effectiveTenantId` requirement.

### Duplicate / Redundant
- Two draft endpoints (auth vs public) — intentional for guest vs user.
- Job polling from multiple hooks — mitigated by shared state where used.

### Needs Refactor Before MI
- Implement `runQaSweep` or remove QA sweep.
- Add `fix_catalog` to `MI_DRAFT_GOALS` and implement handler.
- Fix Power Fix gating for temp drafts.
- Add florist `requiredTermsAny` in guards.
- Persist qaReport in preview.meta when QA is implemented.

---

## Phase 0 Blocker Warning

**Remaining Phase 0 blockers:**

1. **QA agent (P0.5):** Entirely non-functional. Either implement or disable scheduler.
2. **Power Fix (fix_catalog):** Backend does nothing; UI reports success incorrectly.
3. **Power Fix temp gating:** Temp drafts cannot use Power Fix.

**Recommendation:** Address (2) and (3) before MI v1; (1) can be deferred if QA is out of Phase 0 scope, but the scheduler should not call an empty function in production.
