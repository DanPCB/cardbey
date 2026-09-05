# Impact Report: Live `/s/:slug` vs Draft Preview catalog mismatch

## Symptom

[Live AWE FINANCIAL](https://cardbey.com/s/awe-financial?returnTo=%2F) shows **1** service.  
[Draft preview](https://cardbey.com/preview/website/cmsn1odxg003clcb3w1epjuer?generationRunId=cmsn1ob8k0032lcb3i941w2f5&returnTo=%2Fs%2Fawe-financial%3FreturnTo%3D%252F) shows **7** near-identical “Book our consultations” cards.

## Root cause

| Surface | Catalog source |
|---------|----------------|
| Live `/s/:slug` | Published **Product** rows (DB preferred over projection) |
| Draft `/preview/website/:draftId` | **`DraftStore.preview.items`** only |

Architecture (`docs/ARCHITECTURE_CANONICAL_STORE_PROJECTION.md`) requires overlaying live catalog onto preview when the store is live. Helper `resolveCanonicalStoreProjectionForPreview` exists but is **not wired** into `WebsitePreviewPage`. Opening the original generation/committed draft therefore still shows stale demo/generation items.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Hide intentional unpublished catalog edits after refresh | Blind `isLive → overlay` | Skip overlay when `changeHints` includes `Catalog` on an **editable** draft; always overlay for **committed** snapshots |
| Network failure fetching public store | Overlay fetch fails | Keep draft catalog (`live_fetch_failed`) |
| False-positive duplicate-name heuristic | Rare menus with many identical titles | Only prefer live when public key exists; owner can still edit after create-from-store |

## Impact scope

- Dashboard: `storeProjection.ts`, `WebsitePreviewPage` draft load path
- Live `/s/:slug` and publish/republish APIs: **unchanged**

## Smallest safe patch

1. Refine `shouldPreferLiveCatalog` (committed+live always; skip when editable + Catalog hint; detect duplicate filler).
2. Call `resolveCanonicalStoreProjectionForPreview` at end of `loadDraftFromServer` before returning preview.
3. Unit tests for preference rules.

## Operator note (no code)

Do **not** Republish solely to “match” screens if the draft still has 7 demos — that would push demos onto live. After this patch, the editor baseline matches live; use a fresh editable revision for catalog edits, then Republish when ready.
