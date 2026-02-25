# Impact Report: Phase 1 Freeze & Ship + P0 Generation Mismatch

**Date:** 2026-02-13  
**Scope:** UI-only. No backend, no automation spine, no new endpoints, no new polling, no executor logic changes.

---

## 1) What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| **Tests assert on hidden UI** | MIUnifiedHelper.test.tsx expects chips/suggestions (add20, smart promo, category, autofill) and debug badges. | Update tests to Phase 1: only 3 chips (tags, rewrite, hero), only 3 suggestions; remove assertions for hidden features. Do NOT reintroduce features to pass tests. |
| **Hero flow** | If any path expected "open MI with hero intent". | Hero already opens modal via onOpenHeroModal; panel suggestion already calls onOpenHeroModal + close. No MI open for hero. |
| **Progress strip timing** | 8s → 5–8s (e.g. 6s). | Single constant change; no polling/endpoint. |
| **Category / product entry points** | "Ask MI about category" and product CTA open panel with add_items/smart_promo. | Phase 1: hide category button and product smart-promo CTA in normal mode (or leave and panel suggestions will show only 3; chips already restricted). Spec says "Hidden completely" for category improve and smart promo – so hide the entry points that lead to those (category button, product CTA) or only hide inside panel. Spec says "Restrict MI Pills to 3" and "Only 3 chips visible" – so chips and panel pills are 3; category/product can still open panel but suggestions list will only show tags, rewrite, hero. |

---

## 2) Impact scope

- **Files touched:** MIHelperPanel.tsx, MICommandBar.tsx, miSuggestions.ts, StoreDraftReview.tsx (progress 8s→6s only), MIUnifiedHelper.test.tsx, docs/MI_UNIFIED_HELPER.md.
- **Not touched:** Backend, miRoutes, orchestra start/run, draft-store API, publish API, miExecutor, miCommands, useOrchestraJobUnified, any new endpoints or polling.

---

## 3) P0 Generation Mismatch — Step 0 (risk check)

**Files that display item images (Draft Review + Public Preview):**

- `StoreDraftReview.tsx` — product cards, hero, avatar; itemImageMap; SSE image updates.
- `ProductReviewCard.tsx` — product imageUrl.
- `assignCards.ts` — imageUrl for grid.
- `StorePreviewPage.tsx` / `PublicStorePage.tsx` — published store product images.
- `StoreReviewPage.tsx` — draft normalization, imageUrl.
- `PublicFinalPublishReview.tsx` — item.imageUrl.

**Files that write or transform item/image data:**

- `StoreDraftReview.tsx` — setItemImageMap, updateProduct(imageUrl), hero/avatar override, PATCH draft preview.
- No new endpoints or API contracts; all use existing draft/preview and SSE.

**Conclusion:** Generation mismatch fix will be UI-only: single helper `getItemImage(item, draft)`, mismatch detector (UI), and scope cache by generationRunId. No backend or spine changes.

---

## 4) Smallest safe patch (Phase 1 freeze)

1. **MIHelperPanel:** Hide Product/Category badge when `!showDevDebug()`. Keep Suggestions (filtered to 3 in Step 2). Keep minimal status ("Working…", "Updated.", "Failed."). All other debug UI already behind showDevDebug().
2. **MICommandBar:** Build suggestionChips with only `generate_tags`, `rewrite_descriptions`, `generate_store_hero` (when onOpenHeroModal). Remove autofill, add_20_items, create_smart_object_promo from visible chips. Hero already calls onOpenHeroModal and does not open MI.
3. **miSuggestions:** In panel, when `!showDevDebug()`, filter suggestions to preset.id in `['tags','rewrite','hero']` (and hero only when onOpenHeroModal). getSuggestionsForMode can return only these for Phase 1 in non-debug.
4. **StoreDraftReview:** Change progress auto-hide from 8000 to 6000 ms.
5. **Tests:** Update MIUnifiedHelper to expect only 3 chips; no add20/smart-object/category_add_items in non-debug; no "coming soon" copy; optional debug tests can expect same 3 chips (or no add20 at all per "hidden completely").
6. **Docs:** Add "Phase 1 Frozen Scope" banner to MI_UNIFIED_HELPER.md.

---

## 5) Rollback (single-commit revert)

- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx`
- `docs/MI_UNIFIED_HELPER.md`
- `docs/IMPACT_REPORT_PHASE1_FREEZE_AND_SHIP.md` (optional)

No other files touched. (miSuggestions.ts had no code change — filtering is in MIHelperPanel.)

## 6) Vitest command + results (Phase 1 freeze)

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miHelperStore.test.ts tests/MIUnifiedHelper.test.tsx
```

Expected: **54 tests passed** (10 miHelperStore + 44 MIUnifiedHelper).

## 7) P0 Generation Mismatch — status

Step 0 (risk check) completed: files that display/write item images listed; no new endpoints.  
Steps 1–6 (trace mapping, key-based join, mismatch detector, scope by generationRunId, tests, manual checklist) are **not implemented** in this change. They remain UI-only, no spine changes, and can be done in a follow-up. See same doc Section 3 for scope.
