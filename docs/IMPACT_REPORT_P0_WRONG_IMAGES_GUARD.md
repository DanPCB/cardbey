# P0 Wrong Images Guard – Impact Report

## Summary
Additive-only change to stop wrong-vertical images (shoes/office/people) for Desserts/Sweets stores in Draft Review. No refactors of the store creation spine (Quick Create → Draft Review → Publish → Live).

## What could break (and why)
- **Display only**: Hero/avatar/product URLs are filtered through a vertical guard in the **UI only**. Resolvers (`getResolvedStoreHeroUrl`, `getResolvedStoreAvatarUrl`, `getItemImage`) are unchanged; we apply the guard on the **consuming** side (StoreDraftReview) before passing URLs to components. **Risk**: None to persistence or API.
- **Repair mode**: New "Repair wrong images" action calls existing `assignImagesToDraft` with an option `repairOnly: true` and optionally sends hero/avatar replacements in the same PATCH. **Risk**: Backend must accept existing PATCH shape; we only add optional `preview.hero` / `preview.avatar` when present (already used elsewhere in pre-publish flow).
- **Vertical inference**: Adding "sweets" to food keywords and ensuring food from businessType/name is not overridden by category. **Risk**: None; inference is already priority-ordered (businessType → storeName → category → tags). We only extend keywords.

## Impact scope
- **Draft Review UI**: Hero, avatar, product card images may show fallback/empty when guard fails (no DB overwrite unless user clicks "Repair wrong images").
- **Autofill**: Same pipeline; new optional repair-only run and optional hero/avatar replacement in PATCH.
- **Unchanged**: Core endpoints, store creation pipeline, auth, polling, publish flow.

## Smallest safe approach
1. **Guard layer**: In Draft Review, compute `effectiveVertical` from draft (businessType/name/category/tags). For each of hero URL, avatar URL, and product image URLs, run `passesVerticalGuardForUrl(vertical, url)`; if fail, pass `null` (or food placeholder) to the component. No changes to `resolveImageUrl.ts` or draft PATCH API.
2. **Repair**: Add `repairOnly` option to `assignImagesToDraft`; when true, replace existing images that fail guard (and always allow hero/avatar). Return `heroReplacement`/`avatarReplacement` when current hero/avatar fail guard. New button "Repair wrong images" calls this and PATCHes `preview.items` + optional `preview.hero`/`preview.avatar`.
3. **Vertical**: Add "sweets" to `FOOD_KEYWORDS` in `guards.ts`. No change to inference order; category "general"/"retail" does not override once businessType/storeName set food.

## Feature flag
- Repair mode is already gated by `isImageRepairEnabled()` and/or the one-off "Repair wrong images" button (no new global flag required). Guard layer in UI is always on for food vertical (no flag).
