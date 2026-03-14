# Impact report: Preview vs published storefront layout

## Risk assessment (before code changes)

**Could the proposed fix break current preview, publish, or public store rendering?**

- **Preview (draft/review):** No. We are not changing StoreDraftReview, draft-store API, or how draft data is loaded. Draft preview and publish-review continue to use the same data source (draft.preview from API).
- **Publish flow:** No. We are not changing publishDraftService, commit, or POST /api/store/publish. Persisted fields (heroImageUrl, avatarImageUrl, storefrontSettings) are already written on publish.
- **Public storefront (StorePreviewPage):** Low risk. We are (1) adding one optional field to the backend response (storefrontSettings) so the same view model as draft is available, and (2) adding DEV-only logs. If the backend select fails on an older DB without the column, Prisma would throw—but storefrontSettings exists in the schema and migrations; we only add it to the select. No change to when we use fallback (context) vs dedicated preview.

**Conclusion:** Proceed with minimal changes. No refactor of auth, store creation, or publish flow.

---

## 1. Render paths

| Context | Route | Component | Data source |
|--------|--------|-----------|-------------|
| **Draft preview / review** | `/app/store/:id/review` (mode=draft or published) | StoreDraftReview | Draft from GET /api/stores/:storeId/draft or draft-store; uses draft.preview (items, categories, hero, avatar, storefront, meta). |
| **Published / public storefront** | `/preview/store/:storeId` (?view=public) | StorePreviewPage | GET /api/store/:storeId/preview (then fallback: GET /api/store/:storeId/context + build minimal preview). |

---

## 2. Same vs different renderers

- **Preview/review (StoreDraftReview):** Renders from `effectiveDraft` (draft.preview + catalog, meta). Uses ProductCard, CategoryNav, grid/list from draft data; hero/avatar from preview or store.
- **Published (StorePreviewPage):** Renders from `previewData` (from GET /api/store/:id/preview or fallback). Uses same ProductCard, CategoryNav, grid/list components when `finalPreviewData` has items/categories. **Same component family**, but **different data source**: published uses Business + Products; draft uses DraftStore.preview.
- So: **same renderer components**, **different data**. When the published API returns the same shape (items, categories, hero, avatar, storefront), the layout should match. When the API fails and we use **fallback** (context only), we set `minimalPreview` with **empty items and categories** → generic empty layout.

---

## 3. Publish transformation (what gets persisted)

From `publishDraftService.js`:

- **Business:** name, type, slug, description, logo, isActive, **heroImageUrl**, **avatarImageUrl**, publishedAt, **stylePreferences**, **storefrontSettings** (defaultView, allowUserToggle), updatedAt.
- **Products:** From draft preview.items (or catalog.products); name, description, price, category, imageUrl, isPublished, etc.
- **storefrontSettings** is persisted when draft has `rawPreview.storefront` (defaultView 'list'|'grid', allowUserToggle boolean).

Draft visual config used at publish: hero/avatar from preview.hero, preview.avatar, meta; storefront from rawPreview.storefront; categories and items from preview.

---

## 4. Published page fallback

- **Primary:** GET /api/store/:storeId/preview → returns { ok, status, mode, preview } with items, categories, heroImageUrl, avatarUrl, **storefront** (defaultView, allowUserToggle).
- **Fallback:** If that request throws (e.g. 404, 500), the frontend calls GET /api/store/:storeId/context and builds **minimalPreview** with **categories: [], items: []**. So the page shows the same shell but with **no products and no categories** → “generic” empty card grid.
- **Backend bug:** In GET /api/store/:id/preview the Prisma **select** omits **storefrontSettings** (comment: “not in all Prisma client builds”). So `business.storefrontSettings` is always undefined, and the handler always uses default `storefront = { defaultView: 'grid', allowUserToggle: true }`. Layout preference is persisted on publish but never read back for the preview response.

---

## 5. Summary table

| Item | Preview (draft/review) | Published (public) |
|------|------------------------|---------------------|
| **Renderer** | StoreDraftReview (draft.preview + catalog) | StorePreviewPage (previewData from API or fallback) |
| **Draft visual config** | draft.preview (hero, avatar, storefront, items, categories, meta) | N/A (draft not used for published URL) |
| **Published visual config** | N/A | Business (heroImageUrl, avatarImageUrl, stylePreferences, **storefrontSettings**) + Products |
| **Missing/dropped** | — | **storefrontSettings** not selected in GET /store/:id/preview, so layout preference not returned; fallback path has **empty items/categories**. |
| **Fallback trigger** | — | When GET /api/store/:id/preview throws → use context → minimalPreview with items: [], categories: []. |
| **Root cause** | — | (1) Backend omits storefrontSettings in preview select; (2) if preview request fails, frontend shows minimal preview (empty list) → generic layout. |

---

## 6. Minimal safe fix (applied)

**A. Backend:** In GET /api/store/:id/preview, add **storefrontSettings** to the Business select so the response includes the persisted layout (defaultView, allowUserToggle). No change to publish or draft APIs.

**B. Frontend:** Add lightweight **DEV** logs:
- When loading preview: log whether source is “dedicated preview” vs “fallback (context)” and storeId.
- When applying preview data: log “storefront config loaded” (defaultView, allowUserToggle) or “using default storefront”.
- When setting minimal preview from fallback: log “fallback reason: preview endpoint failed” and the error (or status).

No change to when fallback is used; only logging so we can see which path ran.

---

## 7. Changed files

- **apps/core/cardbey-core/src/routes/stores.js:** Add `storefrontSettings: true` to the select in GET /:id/preview; add optional DEV log for preview response (storeId, hasStorefrontSettings).
- **apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx:** Add DEV logs: after successful preview load (renderer: dedicated preview, storefront config); when using fallback (fallback reason, storeId); when setting viewMode from preview.storefront.

---

## 8. Manual verification steps

1. **Publish a store** (draft with categories, products, hero, avatar). Note storeId.
2. **Open published URL:** /preview/store/:storeId?view=public. Confirm layout matches review (grid/list, categories, product cards). Check browser console (DEV): “Store preview loaded from dedicated endpoint”, “storefront config loaded” (or “using default storefront”).
3. **If layout was wrong before:** Confirm it now matches. If it still shows empty/generic, check console for “fallback reason: preview endpoint failed” and the error; then verify GET /api/store/:storeId/preview returns 200 and body.preview.items/categories.
4. **Draft preview unchanged:** Open /app/store/:id/review (draft or mode=published). Confirm layout unchanged.
5. **Publish flow unchanged:** Publish again from review; confirm success and no regression.

---

## 9. Root cause summary

- **Preview path:** StoreDraftReview uses draft.preview (items, categories, hero, avatar, storefront). Same component family as public page.
- **Published path:** StorePreviewPage uses GET /api/store/:storeId/preview. Backend was not selecting **storefrontSettings**, so the response always used default storefront; layout preference was persisted on publish but never returned.
- **Fallback:** If the preview request fails, the frontend builds minimal preview from context with empty items/categories → generic empty layout. DEV logs now show when this path is used.
- **Fix:** Backend now selects and returns storefrontSettings. DEV logs added for renderer path and config.
