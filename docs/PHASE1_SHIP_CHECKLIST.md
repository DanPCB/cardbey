# Phase 1 Ship Checklist

**Scope:** UI freeze + item ↔ image mapping fix + Phase 1 ship polish (auth nav, auto images, promo entry, Generate tags). No automation spine or API changes.

---

## Feature flags (Phase 1 ship polish)

| Flag | Type | Purpose |
|------|------|--------|
| `VITE_ENABLE_IMAGE_AUTOFILL_AUTO` | env | Enable automatic image autofill on Draft Review first load when draft has missing images. |
| `cardbey.imageAutofill.auto` | localStorage | Dev override: `localStorage.setItem('cardbey.imageAutofill.auto','1')` to enable auto; remove or set `'0'` to disable. |
| `cardbey.imageAutofill` | localStorage | Existing manual gate for "Auto-fill missing images" button. |
| `VITE_PUBLIC_HEADER_AUTH` | env | Enable auth-aware header on marketing frontpage (avatar/menu when logged in). Set `'false'` to show static Login/Sign Up. |
| `cardbey.publicHeaderAuth` | localStorage | Dev override: `'1'` enable, `'0'` disable auth header. |
| `VITE_ENABLE_IMAGE_AUTOFILL_REPAIR` | env | Enable repair mode: replace existing images that fail vertical guard (e.g. shoes on desserts store). Off by default. |
| `cardbey.imageAutofill.repair` | localStorage | Dev override: `localStorage.setItem('cardbey.imageAutofill.repair','1')` to enable repair. |

---

## Desserts / auto-image mismatch fix (Phase 1)

- **inferVertical:** Store-level `businessType` + `storeName` prioritized over category/tags. Desserts/cafe/bakery => food.
- **buildImageQuery / buildProviderQuery:** Generic names (e.g. "general 1") never used in query; use store businessType + category + tags. If category is general/other and tags empty, query = businessType only.
- **Repair mode (optional):** When `isImageRepairEnabled()`, treat item as missing if current image URL fails `passesVerticalGuard(storeVertical)`; replace only when guard fails.
- **Hero fallback:** First product image used for hero/avatar is the first that passes `passesVerticalGuard(storeVertical)`, not first-item blindly.

---

## 🔒 Locked rule (no spine changes)

Do **not** change:

- `POST /api/mi/orchestra/start`
- `GET /api/stores/temp/draft?generationRunId=...`
- `PATCH /api/draft-store/:draftId`
- `POST /api/store/publish`
- `GET /api/store/:id/preview`

**Forbidden:** No new calls to `POST /api/mi/orchestra/job/:id/run`, no new polling/timers (except existing MI progress auto-hide), no publish or auth flow changes.

---

## What’s frozen in UI (Phase 1)

- **MI panel (non-debug):** Input + Send + minimal status only. No executor badge, console, intent/preset badges, last result.
- **MI chips:** Only **Generate tags**, **Rewrite descriptions**, **Change hero** (hero opens modal only).
- **Hidden:** Add 20 items, Smart promo, Category “Ask MI”, product AmbientMIAssistant (smart promo), Auto-fill images chip.
- **Progress strip:** Visible only when job is running/queued or for 6s after completion; then hidden.
- **Hero:** “Change hero” opens hero/avatar modal; does not send MI.

---

## How to enable debug

In browser console (dev only):

```js
localStorage.setItem('cardbey.debug', '1');
```

Reload. To disable: `localStorage.removeItem('cardbey.debug');`

---

## How to verify mismatch fix (manual)

1. **Quick Create twice:** Run AI Quick Create twice back-to-back with different names. Confirm products from run 1 never show images from run 2.
2. **Reorder/categories:** In draft review, change grouping (e.g. by category). Confirm each product still shows its own image (no “energy bar” showing a bulb).
3. **Publish:** Publish a draft and open live store. Confirm product images match what was in draft review.
4. **Missing image:** For a product with no image, confirm placeholder (no wrong image from another item).

---

## Manual verification (Phase 1 ship polish)

1. **Logged-in frontpage:** Sign in, visit `/` (marketing). Expect account icon / avatar and menu (Account, Dashboard, Logout). No Login/Sign Up. Refresh → same. Log out or incognito → expect Login + Sign Up.
2. **Auto images (flag on):** Set `VITE_ENABLE_IMAGE_AUTOFILL_AUTO=true` and `localStorage.setItem('cardbey.imageAutofill.auto','1')`. Quick Create → Draft Review. Expect "Auto-filling images…" then "Images updated." when there are missing images; no duplicate runs on refresh (run-once per draft).
3. **Manual image replace:** On Draft Review, use "Add image" / "Click to add" for a product. Confirm it stays; auto-fill must not overwrite it.
4. **Create promo → QR:** From Draft Review "More" → "Create QR Promo" → should navigate to Promotions page for that store. Create a promo, copy short link, download SVG (primary) and PNG. Open `/p/:slug` in incognito → scan/visit increments count; CTA works (targetUrl or product link + coupon if set).

---

## Manual verification script (copy-paste checklist)

```
[ ] 1. Auth: Log in → open / (marketing) → see account icon (not Login/Sign Up). Refresh → same. Incognito → see Login + Sign Up.
[ ] 2. Auto images: VITE_ENABLE_IMAGE_AUTOFILL_AUTO=true + localStorage cardbey.imageAutofill.auto=1 → Quick Create → Draft Review → "Auto-filling images…" then "Images updated." (once per draft).
[ ] 3. Manual image: Draft Review → "Add image" on a product → confirm it stays; auto-fill does not overwrite.
[ ] 4. Promo: Draft Review → More → "Create QR Promo" → lands on Promotions page → create promo → copy link → download SVG → incognito /p/:slug → count increments, CTA works.
[ ] 5. Desserts store: Quick Create a desserts store → Draft Review. Hero and product images must be food/dessert (no shoes/office/person). Generic names ("general 1") must not drive wrong queries.
[ ] 6. Repair (optional): Set cardbey.imageAutofill.repair=1 → existing wrong-vertical image on a product gets replaced on next auto-fill or manual "Auto-fill missing images."
```

---

## Test commands

From dashboard app root:

```bash
cd apps/dashboard/cardbey-marketing-dashboard

# MI + helper store (includes Generate tags → PATCH + refresh test)
npx vitest run tests/miHelperStore.test.ts tests/MIUnifiedHelper.test.tsx

# Item ↔ image mapping (Phase 1 key join)
npx vitest run tests/itemImageMapping.test.ts

# Image autofill flags (run-once, no overwrite)
npx vitest run tests/featureFlagsImages.test.ts

# Image autofill guards (vertical, generic name, repair, hero fallback)
npx vitest run tests/imageAutofillGuards.test.ts
```

All must pass.

---

## Rollback list (revert these files)

**Phase 1 ship polish (this release):**
- `apps/dashboard/cardbey-marketing-dashboard/src/components/layout/PublicHeader.tsx` (auth header gate + useCurrentUser)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/featureFlags.ts` (auto flag + didRun helpers + repair flag)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (auto-run effect, status UI, onNavigateToPromotions, refetch-on-MI-patch, hero/avatar guard fallback)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/StoreReviewHero.tsx` (onNavigateToPromotions, Create QR Promo → navigate)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` (401 message "run MI actions")
- `docs/PHASE1_SHIP_CHECKLIST.md`, `docs/PHASE1_SHIP_RISK_CHECK.md`

**Desserts / auto-image mismatch fix:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/guards.ts` (inferVertical storeName, prioritize store-level)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/query.ts` (generic name + general/other => businessType only; storeName in provider)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/ranking.ts` (passesVerticalGuardForUrl)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts` (repair mode, getFirstProductImageUrlForHero, storeName)
- `apps/dashboard/cardbey-marketing-dashboard/tests/imageAutofillGuards.test.ts` (vertical, repair, hero, generic-query tests)

**Existing Phase 1 (mapping + MI):**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/itemImageMapping.ts` (new; delete to rollback)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/storeMedia.ts` (Phase 1 comments only; optional revert)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (itemImageMap scope, imageByStableKey, getItemImage in grid)
- `apps/dashboard/cardbey-marketing-dashboard/tests/itemImageMapping.test.ts` (new; delete to rollback)
- `docs/PHASE1_SHIP_CHECKLIST.md` (this file; optional)

For **full** Phase 1 freeze rollback (MI UI + mismatch), also revert:

- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx`
- `docs/MI_UNIFIED_HELPER.md`

---

## Auth (verify only; no code changes)

- **Logged out** → open draft review URL → redirect to login → after login, return to same review URL.
- **Logged in** → load draft, edit, publish → success.

No new endpoints; no auth logic changes.
