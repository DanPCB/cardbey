# Impact Report: Image Autofill (Day 2)

## 1) What could break

- **Store creation workflow (Quick Create → Draft Review → Publish → Live):** Only if the new code path runs and fails in a way that blocks the user. Mitigation: feature-flagged and optional. No code runs when flags are off. No changes to start/draft/patch/publish spine.
- **Draft PATCH overwriting existing data:** If we send a PATCH that replaces entire `preview.items` with a minimal set of fields, backend might drop tags/descriptions. Mitigation: We build the patch from existing draft items and only add/overwrite `imageUrl` for items that currently have no image. We send the same shape as existing MI patches (items with id, and the fields we update). If the backend does deep merge, we only send `imageUrl` for items we fill.
- **UI not showing autofilled images after PATCH:** If `draftNormalize` does not merge `imageUrl` from `preview.items` into `products`, refetch would not show them. Mitigation: We add `imageUrl` merge in `draftNormalize` (same pattern as tags/description).

## 2) Why

- New optional module and button; no change to existing flows unless the user clicks "Auto-fill missing images" and flags are on.
- PATCH body is additive (imageUrl only for missing); we use stable keys so we don’t assign by index.

## 3) Impact scope

- **Touched:** New files under `src/lib/images/` (library, provider, ranking, assignment), `draftNormalize.ts` (merge imageUrl), `StoreDraftReview.tsx` (one button + handler). Optional refetch after autofill PATCH.
- **Unchanged:** Quick Create, publish, MI tags/rewrite/hero, auth, routing, generation pipeline.

## 4) Smallest safe patch

- Add image library (JSON) + `searchLibrary()`.
- Add provider interface + one provider (env + key); no calls when disabled.
- Add ranking with text similarity and mismatch guard; return `null` when score &lt; threshold or mismatch.
- Add `assignImagesToDraft()` that builds a PATCH body with `preview.items[*].imageUrl` only for items missing image; use stable keys; single-shot (no polling).
- Add "Auto-fill missing images" button gated by `localStorage` + `VITE_ENABLE_IMAGE_AUTOFILL`; on success call existing refetch.
- In `draftNormalize`, merge `preview.items[].imageUrl` into `products` (same as tags/description).
- All external provider calls behind env; on failure use library-only or leave placeholder.

## Rollback

- Set `VITE_ENABLE_IMAGE_AUTOFILL=false` and remove `cardbey.imageAutofill` from localStorage. Hide or remove the button. Revert `draftNormalize` imageUrl merge and new `src/lib/images/*` files if needed.
