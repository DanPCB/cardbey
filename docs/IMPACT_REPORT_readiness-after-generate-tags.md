# Impact Report: Readiness regression after "Generate tags"

## Summary
Fix for bug where global store readiness dropped from 100% to ~70% after clicking "Generate tags", with toast "To publish, upload your logo/avatar and a background" even when avatar and hero/background were already set.

## Root cause
- When the Orchestra job for `generate_tags` completes, the frontend calls `onRefresh()` → `handleRefresh()` in `StoreReviewPage`, which refetches `GET /stores/:id/draft` and then **replaced** the whole draft with the refetch result (`setDraft(storeDraft)`).
- The refetch response was used to build a new `StoreDraft` that **did not include `preview`** (hero/avatar come from `draft.preview` in the API; we were not passing `canonical.preview` into the refresh-built draft). So after refetch, `baseDraft.preview` became undefined.
- Readiness is computed from `effectiveDraft` / `baseDraft` (e.g. `getResolvedStoreAvatarUrl(draftWithPreview)`, `getResolvedStoreHeroUrl(draftWithPreview)`). With no preview and no preserved meta/store visuals, the UI treated avatar/hero as missing → readiness dropped.

## What could have broken (if we had changed more)
- **Publish flow**: Not changed; we only changed how refetch result is applied.
- **Draft patch / preview flow**: Not changed; we merge refetch with current draft so store-level fields are preserved; catalog (products/tags) still comes from refetch.

## Fix (minimal)
1. **StoreReviewPage.tsx**
   - Pass `canonical.preview` into the refresh-built draft (`_preview` in storeData, then `incomingPreview` on the draft).
   - Keep a ref to the current draft (`draftRef`). When applying refetch result, **merge** with current draft via `applyDraftPatch(current, refetchDraft)` so store-level visuals (avatar, hero, preview) are never dropped when the refetch omits them.
2. **applyDraftPatch.ts** (new)
   - Helper that merges a partial draft (refetch) into the current draft: applies catalog from partial, but **preserves** `meta`/`store`/`preview` hero/avatar when partial has null/empty for them.
3. **Unit test**
   - `tests/applyDraftPatch.test.ts`: partial update must not remove hero/avatar; null/empty in partial must not overwrite existing visuals.

## Changed files
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` (handleRefresh: include preview, use applyDraftPatch when current draft exists)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/applyDraftPatch.ts` (new)
- `apps/dashboard/cardbey-marketing-dashboard/tests/applyDraftPatch.test.ts` (new)
- `docs/IMPACT_REPORT_readiness-after-generate-tags.md` (this file)

## Manual test steps
1. Create/finish a store draft so the review page shows "You're 100% ready to publish" and product cards show high readiness. Ensure avatar and hero/background are set.
2. Click "Generate tags" and wait for completion.
3. **Expected**: Global readiness stays 100%; no "Missing logo/avatar/background" toast. Product cards still show updated tags.
4. In Network: after job completes, `handleRefresh` triggers `GET /stores/:id/draft`; response includes `draft.preview` (backend already preserves hero/avatar in `patchDraftPreview`). Frontend now also merges refetch with current draft so even if response were partial, store-level visuals would not be dropped.

## Acceptance criteria met
- With avatar + hero/background set, global readiness stays 100% before and after "Generate tags".
- No "Missing logo/avatar/background" toast after tag generation unless those fields are actually missing.
- Tag generation still updates only item fields; store-level fields are preserved (backend was already safe; frontend merge ensures no regression).
- Unit test: `applyDraftPatch` partial update does not remove hero/avatar.
