# Storefront List/Grid Toggle – Manual Verification Checklist

## Summary

- **Store settings:** `storefront.defaultView` ("list" | "grid", default "grid"), `storefront.allowUserToggle` (boolean, default true).
- **Draft review:** List/Grid toggle always visible; "Set as storefront default" saves default view for the store.
- **Public storefront:** Initial view from store default; toggle shown only when `allowUserToggle` is true.
- **Words-only menus:** Grid uses compact block when item has no image; list remains compact (name, desc, price, Add).

---

## 1. Migration & defaults

- [ ] **Schema:** `Business.storefrontSettings` (Json?) present in Prisma schema.
- [ ] **DB:** Run `npx prisma db push` (or migrate) in `apps/core/cardbey-core` so the column exists.
- [ ] **Existing stores:** No backfill required; GET preview uses defaults when `storefrontSettings` is null: `defaultView: "grid"`, `allowUserToggle: true`.

---

## 2. Draft review (editor) UI

- [ ] Open a store preview in **editor** context (e.g. from dashboard, not public `/s/slug`).
- [ ] **List/Grid toggle:** Toggle between Grid and List is always visible.
- [ ] **Set as storefront default:** With an existing (published) store and logged in:
  - Switch to List (or Grid), click "Set as storefront default".
  - Expect success toast; reload public storefront and confirm initial view matches (list or grid).
- [ ] **No store yet (draft only):** "Set as storefront default" is not shown when there is no store id.

---

## 3. Public storefront

- [ ] **Initial view:** Open public storefront (e.g. `/preview/store/:storeId` or `/s/:slug`). First paint uses `storefront.defaultView` (list or grid). If never set, default is grid.
- [ ] **Toggle visibility:** If store has `allowUserToggle: true` (default), List/Grid toggle is visible. If set to false via PATCH, toggle is hidden.
- [ ] **PATCH store:** `PATCH /api/stores/:id` with `{ storefrontSettings: { defaultView: "list" } }` or `{ allowUserToggle: false }`. Reload preview and confirm behavior.

---

## 4. Words-only (no image) items

- [ ] **Grid:** Store with at least one product that has **no** image. In grid view, that item does **not** show a large blank or AI placeholder; it shows a **compact** block (short height) with name, description, price, Add.
- [ ] **List:** Same store in list view: compact rows (name, desc, price, Add) unchanged.

---

## 5. Regression (draft → preview → publish → public)

- [ ] **Draft → Preview:** Create/edit draft, switch List/Grid, set default when store exists; no errors.
- [ ] **Publish:** Publish draft; storefront default and allowUserToggle from draft `preview.storefront` (if present) are applied to Business on publish.
- [ ] **Public storefront:** Open public URL; initial view and toggle visibility match store settings; image resolution and existing product display unchanged.

---

## Files touched (reference)

- **Backend:** `apps/core/cardbey-core/prisma/schema.prisma` (storefrontSettings), `apps/core/cardbey-core/src/routes/stores.js` (GET preview + PATCH), `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js` (storefront on publish).
- **Frontend:** `StorePreviewPage.tsx` (PreviewData.storefront, initial view, showViewToggle, showSetDefaultView, setStorefrontDefaultView, no seed placeholder in grid), `ProductCard.tsx` (compactWhenNoImage).
