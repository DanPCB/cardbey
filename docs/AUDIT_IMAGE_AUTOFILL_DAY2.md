# Audit: Image Autofill Day 2 (pre-implementation check)

## 1) Files located

| File | Exists | Notes |
|------|--------|------|
| `src/lib/draftNormalize.ts` | Yes | Merges tags/description from preview.items; imageUrl merge present but did not guard “no overwrite if product already has image”. |
| `src/features/storeDraft/StoreDraftReview.tsx` | Yes | Day 2 button and assignImagesToDraft wired; gated by isImageAutofillEnabled(), not readonly. |
| `tests/draftNormalize.test.ts` | Yes | Has tags merge test; has imageUrl merge test. |

## 2) Existing image mapping / placeholders

- **itemImageMap:** `StoreDraftReview` keeps `useState<Map<string, string>>` (productId → imageUrl) for SSE/Phase 1 updates; used with `getItemImage(..., { itemImageMap, imageByKey })`.
- **imageUrl:** On products (`catalog.products`), on preview.items; draftNormalize merges preview.items[].imageUrl into products (merge existed; guard for “no overwrite” added in this pass).
- **preview.items / catalog.products:** Display uses `effectiveDraft.catalog.products`; refetch normalizes via draftNormalize; backend can return tags/imageUrl in preview.items; normalization merges into products.
- **Stable key:** `getItemStableKey`, `buildImageByStableKey`, `getItemImage` in `src/lib/itemImageMapping.ts`; assignImagesToDraft uses getItemStableKey; no index-based join.

## 3) Current behavior (confirmed)

- **Does preview.items[].imageUrl flow into products in Draft Review?** Yes. draftNormalize merges preview.items into products by id/clientId; imageUrl was merged unconditionally. Updated so we only set product.imageUrl from preview when the product does **not** already have an image (no overwrite).
- **Existing image autofill / provider?** Yes. There is an existing “Improve” dropdown with a different autofill path (createStoreDraft, suggestImages, etc.). Day 2 is a **separate** gated button “Auto-fill missing images” that uses library + Pexels + ranking and PATCH draft-store only; no conflict with Phase 1 spine.

## 4) Summary

- **What exists:** draftNormalize (tags, description, imageUrl merge); itemImageMapping (stable keys); full Day 2 image subsystem (types, seedLibrary, library, providers, ranking, assignImages, featureFlags); Day 2 button in StoreDraftReview; tests for imageUrl merge and imageAutofillDay2; IMPACT_REPORT and IMAGE_AUTOFILL_DAY2 docs.
- **What was missing / fixed:** (1) draftNormalize: do not overwrite product.imageUrl when product already has an image. (2) Test that normalization does not overwrite existing product imageUrl. (3) Docs: explicit test commands and rollback file list.
- **Conflicts:** None. Single image mapping path (stable keys); Day 2 is additive and gated; existing Improve dropdown remains separate.
