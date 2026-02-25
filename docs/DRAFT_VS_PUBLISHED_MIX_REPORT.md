# Draft Editor vs Published Preview — Where They Got Mixed

**Draft Review Editor (editable):** `/app/store/temp/review?mode=draft&jobId=...` → data source = **draft only**  
**Published Preview / Storefront (public):** `/app/preview/store/:storeId` → data source = **published**

---

## Exact files/lines where draft vs published got mixed

| File | Lines | Issue |
|------|--------|--------|
| **StoreReviewPage.tsx** | **604–666** | When `mode !== 'draft'`, the page **prefers published store**: calls `apiGET('/stores/:id')`, `apiGET('/menu/items?...')`, `apiGET('/menu/categories?...')`. If store exists, builds `storeData` from **published store + menu** (lines 654–666). That flows into conversion and `StoreDraftReview` receives hero/avatar/categories derived from **published** data, not draft. |
| **StoreReviewPage.tsx** | **512** | Branch is `if (mode === 'draft')` only. When `storeId === 'temp'` but `mode` is missing (e.g. `/app/store/temp/review` without query), code falls through to the **non-draft** branch and tries published store first, then draft fallback — mixing data source. |
| **StoreDraftReview.tsx** | **3632** | `getStoreLogoUrl(draftForLogo, businessData, true) \|\| businessData?.profileAvatarUrl \|\| businessData?.logo` — avatar can fall back to `businessData`. `businessData` is set from draft-derived `visualsFromDraft` and from draft refetch, so in practice it is draft-derived; comment says "draft-only; no published preview" but the fallback chain could be misread. |

**No import/render mixing:** The draft editor page does **not** import or render `StorePreviewPage` or `StorePreviewGrid`/`StorePreviewList`. The mixing is **data source**: when the same `StoreReviewPage` + `StoreDraftReview` are used without `mode=draft` (or with `storeId !== 'temp'`), the **published store first** path can supply hero/avatar/categories.

---

## Minimal patch (applied)

1. **StoreReviewPage.tsx**
   - **Lines ~459, 508, 512–514:** Treat Draft Review Editor as `mode === 'draft'` **or** `currentStoreId === 'temp'`.
   - Use draft-only path: `if (mode === 'draft' || currentStoreId === 'temp')` → same block that calls only `GET /api/stores/:id/draft` (no published store, no menu).
   - `ensureAuth()` and `chosenEndpoint` use the same condition.
   - Ensures `/app/store/temp/review` always uses draft payload for hero/avatar/categories, even when `mode` is missing.

2. **StoreDraftReview.tsx**
   - **Top comment:** Component is "Draft Review Editor UI (hero banner + avatar overlay + categories sidebar)"; data source DRAFT ONLY; not to be confused with Published Preview.
   - **Hero/avatar block (~3627):** Comment that hero/avatar/categories resolve only from draft payload; `businessData` is draft-derived (not published store).
   - **ACTION MAPPING (~276):** Label "Published Preview" instead of "published" for `/preview/store/:storeId`.

3. **Structure**
   - Hero banner (StoreReviewHero) and categories sidebar (CategoryIndex) are already always rendered; no layout change.
   - Route paths unchanged; only constants/comments/labels clarified.
