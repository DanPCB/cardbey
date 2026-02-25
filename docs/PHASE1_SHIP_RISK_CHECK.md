# Phase 1 Ship — Risk Check

## What could break

1. **Store creation spine (Quick Create → Draft Review → Publish → Live)**  
   Any change to orchestration, publish endpoint, or draft fetch/PATCH flow could break end-to-end.

2. **Auth on frontpage**  
   If `/api/auth/me` is called without credentials or cache, we could show wrong state (e.g. Login when logged in) or cause 401 noise.

3. **Auto image fill**  
   If auto-run fired repeatedly, it could spam PATCH or overwrite user-set images. If it ran when draft was not ready, it could use stale data.

4. **Promo flow**  
   New entry points or navigation could break if storeId is missing or routes are wrong.

5. **Generate tags / MI**  
   Refetch or 401 handling could affect other MI intents if not scoped correctly.

6. **Desserts / auto-image mismatch fix**  
   inferVertical/query/repair/hero changes could change which images are chosen or replaced. Repair mode could overwrite images if guard logic is wrong.

---

## Why it won’t (guards + feature flags)

- **Spine:** No changes to `POST /api/mi/orchestra/start`, draft fetch, `PATCH /api/draft-store/:draftId`, or `POST /api/store/publish`. No new polling.
- **Auth:** Reuses existing `useCurrentUser` (same as dashboard). No new endpoints. Loading state avoids flash (skeleton until resolved). 401 is handled by existing API layer (no extra console noise).
- **Auto images:** Gated by `VITE_ENABLE_IMAGE_AUTOFILL_AUTO` and `cardbey.imageAutofill.auto`. Run-once per `draftRunKey` via `localStorage['cardbey.imageAutofill.didRun.' + draftRunKey]`. Only fills missing images (existing rule). No overwrite of user-set images.
- **Promo:** Uses existing promos APIs and routes. Entry points only add navigation/link to existing Promotions page and existing modal.
- **Tags/MI:** Single refetch after PATCH success; 401 message only when MI returns 401. No backend changes.
- **Desserts/repair:** Default “fill only missing” unchanged. Repair is opt-in (`cardbey.imageAutofill.repair` / `VITE_ENABLE_IMAGE_AUTOFILL_REPAIR`). Hero fallback only affects when no explicit hero (first guard-passing product image). Vertical inferred from store first, so desserts store gets food vertical even with category “general”.

---

## Rollback steps (exact files)

To revert Phase 1 ship polish:

**Auth (frontpage):**
- `apps/dashboard/cardbey-marketing-dashboard/src/components/layout/PublicHeader.tsx` — revert to static Login/Sign Up only (remove useCurrentUser, account menu, loading placeholder).

**Auto image fill:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/featureFlags.ts` — remove `isImageAutofillAutoEnabled`, `AUTO_STORAGE_KEY`, `getDidAutofillForDraftRunKey`, `setDidAutofillForDraftRunKey` (and env `VITE_ENABLE_IMAGE_AUTOFILL_AUTO`).
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` — remove auto-run effect, `imageAutofillAutoStatus`, and any "Auto-filling images…" / "Images updated." / "Failed." UI.

**Promo entry:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/StoreReviewHero.tsx` — remove "Create QR Promo" link that navigates to promotions page if added as separate from modal (or keep only modal).
- (Publish success "Create QR Promo" is in `publishSuccessOverlay.tsx` — revert that file to auto-navigate only if reverting promo entry.)

**Generate tags (P1):**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` — remove forced refetch after tags PATCH if added, and 401 "Please sign in to run MI actions." message.
- Remove or revert new/updated MI/tags test.

**Docs:**
- `docs/PHASE1_SHIP_RISK_CHECK.md` (this file)
- `docs/PHASE1_SHIP_CHECKLIST.md`

**Desserts / auto-image mismatch fix:**  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/guards.ts` (revert storeName, text order)  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/query.ts` (revert general/other+empty tags rule, storeName)  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/ranking.ts` (remove passesVerticalGuardForUrl)  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts` (remove repair, getFirstProductImageUrlForHero, storeName)  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/featureFlags.ts` (remove isImageRepairEnabled, REPAIR_*)  
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (revert hero/avatar getFirstProductImageUrlForHero usage)

**Feature flags to disable without code revert:**  
Set `VITE_ENABLE_IMAGE_AUTOFILL_AUTO=false`. Remove `cardbey.imageAutofill.auto`, `cardbey.imageAutofill`, and `cardbey.imageAutofill.repair` from localStorage to disable auto, manual, and repair.
