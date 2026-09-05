# Implementation: Draft Preview Catalog Edit Controls V1

Owner catalog toolbar on Draft Preview / website editing menu section (no leave to `/review`).

## Capabilities on menu section (owner only)
- **+ Category** — prompt → persist
- **+ Item** — add into active/section category → opens Edit drawer
- **Rename category** — fix `cat_food_N` labels (toolbar + section header)
- **Clone** item / category
- **Bulk import** — existing Menu upload when `canReplaceMenu`

## Files
- `src/lib/catalog/storefrontCatalogOwnerMutations.ts` (+ test)
- `StorefrontCatalogSection.tsx` — owner toolbar + header actions
- `StorefrontCatalogListRow.tsx` / `GridItem.tsx` — Clone
- `WebsitePreviewPage.tsx` — persist via `patchDraftPreviewViaRuntime`

## Safety
Visitor path unchanged (callbacks omitted). Public never sees owner chrome.
