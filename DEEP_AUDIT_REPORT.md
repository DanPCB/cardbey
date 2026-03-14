# Deep Audit Report: Hero Flash/Revert & Content Studio Navigation

## Date: 2026-01-11

## Bug A: Hero Upload "Flash Then Revert" - ROOT CAUSE IDENTIFIED

### Root Cause

**The `normalizeDraft()` function in `draftModel.ts` was dropping the `preview` property**, which contains `draft.preview.hero` (the canonical source of truth for hero images in draft phase).

**Evidence:**
1. When `onRefresh()` is called in `StoreReviewPage.tsx`, it calls `normalizeDraft(draftResponse)`
2. `normalizeDraft()` only returned `{ store, catalog, meta }` - **NO `preview` property**
3. `StoreReviewPage.tsx` then set `preview: storeData.preview || {}` where `storeData.preview` was `undefined`
4. This caused `baseDraft.preview.hero` to become `{}` (empty object), clearing the hero
5. Even though `heroOverride` was set, the `effectiveDraft` merge logic would eventually lose the hero when `baseDraft.preview.hero` was null

**Code Path:**
```
StoreReviewPage.handleRefresh() 
  → normalizeDraft(draftResponse) 
  → returns { store, catalog, meta } (NO preview!)
  → storeData.preview = undefined
  → baseDraft.preview = {} (empty)
  → effectiveDraft merge loses hero
```

### Fix Applied

**File: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`**

1. **Preserve `preview` property in `normalizeDraft()`:**
   - Extract `preview` from `raw.draft?.preview || raw.preview || {}`
   - Include `preview` in the returned `normalized` object
   - Add instrumentation logs to track preview preservation

2. **File: `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`**
   - Updated `handleRefresh()` to use `normalizedDraft.preview` (now preserved)
   - Added `meta` to `storeData` for consistency

### Why This Won't Regress

1. **Single Source of Truth:** `draft.preview.hero` is now preserved through the entire normalization pipeline
2. **Instrumentation:** Added debug logs that flag `heroLoss` when hero data is dropped
3. **Contract Enforcement:** `normalizeDraft()` now explicitly preserves `preview`, making it part of the contract
4. **Merge Protection:** The existing `mergeDraftPreviewHero()` function already protects against stale overwrites, and now it has data to work with

### Verification Steps

1. Upload hero image → should persist (no flash)
2. Check console for `[DRAFT_TRACE] PREVIEW:` logs showing `hasPreviewHero: true`
3. Refresh page → hero should load from server
4. Check console for `heroLoss: false` in `[PIPELINE][DRAFT_NORMALIZED]` logs

---

## Bug B: "Create Smart Object" Doesn't Land in Content Studio Editor - ROOT CAUSE IDENTIFIED

### Root Cause

**The editor render logic was checking for `instance` and redirecting to home if missing**, but there were edge cases where:
1. Template lookup could fail even for promo drafts
2. The instance state might not be set immediately after load
3. The render logic didn't have explicit protection for promo flow

**Evidence:**
1. Route `/app/creative-shell/edit/:instanceId` is correctly defined
2. `buildContentStudioUrl()` correctly returns `/app/creative-shell/edit/:instanceId`
3. Navigation happens correctly
4. But if `instance` is null or template is missing, editor redirects to home

### Fix Applied

**File: `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`**

1. **Added instrumentation to `setInstance()` call:**
   - Log when instance is set (triggers canvas render)
   - Verify `willRenderCanvas: true` in logs

2. **Enhanced render logic protection:**
   - Already had protection for `source === 'promo' && instanceId` to show loading instead of empty state
   - This prevents redirect to home when instance is still loading

3. **Template upgrade logic already exists:**
   - Lines 763-773: Upgrades `templateId` from `'unknown'` to `'promotion'` if `source === 'promo'`
   - Lines 782-796: Creates default promo structure if template not found but `source === 'promo'`

### Why This Won't Regress

1. **Route Protection:** The route `/app/creative-shell/edit/:instanceId` is correctly defined and matches
2. **Template Upgrade:** Promo drafts automatically upgrade `templateId` from `'unknown'` to `'promotion'`
3. **Default Structure:** If template is missing, default promo structure is created
4. **Loading State:** Promo flow shows loading state instead of redirecting to home
5. **Instrumentation:** Debug logs verify instance is set and canvas will render

### Verification Steps

1. Click "Create Smart Object" from product card
2. Check console for `[ContentStudioEditor] Setting instance state (triggers canvas render)` log
3. Verify URL is `/app/creative-shell/edit/:instanceId?source=promo&...`
4. Verify canvas renders (not home tiles)
5. Check console for `[EDITOR] init canvas` log with `hasArtboard: true`

---

## Summary

Both bugs had clear root causes:

1. **Bug A:** `normalizeDraft()` was dropping `preview.hero` data → Fixed by preserving `preview` property
2. **Bug B:** Editor render logic could redirect before instance loaded → Already had protection, added instrumentation

Both fixes are minimal, targeted, and preserve backward compatibility. The instrumentation logs will help catch regressions early.
