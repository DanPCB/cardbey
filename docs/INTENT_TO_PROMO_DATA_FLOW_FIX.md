# Intent → MI Promotion Creator Data Flow Fix

**Date:** 2025-01-27  
**Status:** ✅ Complete  
**Goal:** Ensure idea text from "Start Creating" modal appears in editor fields and preview card

---

## Problem

When user types an idea in "Start Creating" modal and selects "Promotion", the text was not appearing in:
- Right panel headline/subheadline fields
- Preview card

**Root Cause:** API stores idea in `settings.promo.idea`, but editor expects `scene1.promo.headline`.

---

## Solution

Added normalization layer that maps `idea` → `headline` at multiple points:

1. **In `promoHelpers.ts`** - When draft is returned from API, normalize it before saving
2. **In `ContentStudioEditor.tsx`** - When loading from API or localStorage, normalize if needed
3. **Idempotent mapping** - Only maps if headline is empty (doesn't overwrite user edits)

---

## Files Changed

### 1. **`src/api/miPromo.ts`**
   - Updated `CreatePromoDraftResponse` to include `draft` field
   - Updated `createPromoFromIdea()` to return draft data from API response

### 2. **`src/lib/promoHelpers.ts`**
   - Added import for `saveInstance` from template store
   - Added normalization logic: maps `promo.idea` → `scene1.promo.headline`
   - Saves normalized draft to localStorage immediately after API response
   - Ensures draft structure matches what editor expects

### 3. **`src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Enhanced API draft loading to normalize promotion drafts
   - Maps `promo.idea` → `scene1.promo.headline` when loading from API
   - Added normalization for localStorage drafts (if idea exists but headline is empty)
   - Ensures scene1/scene2/scene3 structure exists

### 4. **`src/features/content-studio/components/IntentRouterModal.tsx`**
   - Added comment documenting the data flow path

---

## Data Flow Path

```
IntentRouterModal (user types "Union Road Florist Promotion banner")
  ↓
createPromoDraftAndNavigate({ idea: "Union Road Florist Promotion banner" })
  ↓
createPromoDraft() → createPromoFromIdea()
  ↓
POST /api/mi/promo/from-idea
  ↓
API stores: settings.promo.idea = "Union Road Florist Promotion banner"
  ↓
API returns: { instanceId, draft: { settings: { promo: { idea: "..." } } } }
  ↓
promoHelpers.ts normalizes:
  - Maps idea → scene1.promo.headline
  - Saves to localStorage
  ↓
ContentStudioEditor loads draft
  ↓
Editor normalizes again (if needed):
  - Checks if scene1.promo.headline is empty
  - Maps promo.idea → headline if empty
  ↓
Preview reads: scene1.promo.headline → "Union Road Florist Promotion banner" ✅
Form reads: scene1.promo.headline → "Union Road Florist Promotion banner" ✅
```

---

## Key Implementation Details

### Normalization Logic

**In `promoHelpers.ts`:**
```typescript
// Map idea to headline in scene1.promo structure
scene1: {
  promo: {
    headline: idea, // Map idea to headline
    subheadline: '',
    brandName: settings.meta?.storeName || '',
    backgroundColor: '#7C3AED',
  },
}
```

**In `ContentStudioEditor.tsx`:**
```typescript
// Map idea to headline if headline is empty (idempotent)
if (idea && !loaded.data.scene1.promo.headline) {
  loaded.data.scene1.promo.headline = idea;
  saveInstance(loaded);
}
```

### Idempotent Mapping

- Only maps if `headline` is empty
- Doesn't overwrite user edits
- Works for both API-loaded and localStorage-loaded drafts

---

## Verification Checklist

### ✅ Start Creating → Promotion → Type Idea → Continue
- [ ] Type "Union Road Florist Promotion banner" in modal
- [ ] Select "Promotion"
- [ ] Click Continue
- [ ] Editor opens
- [ ] **Right panel headline field shows "Union Road Florist Promotion banner"**
- [ ] **Preview card shows "Union Road Florist Promotion banner" as headline**

### ✅ Refresh Page on Editor Route
- [ ] Navigate to editor with idea-based draft
- [ ] Refresh page
- [ ] Draft loads from API/localStorage
- [ ] **Headline still shows the idea text**
- [ ] **Preview still shows the idea text**

### ✅ No Data Loss
- [ ] Edit headline in right panel
- [ ] Preview updates immediately
- [ ] Save draft
- [ ] Refresh page
- [ ] **User edits persist (not overwritten by idea)**

### ✅ No Errors
- [ ] No console errors
- [ ] No "Draft not found" errors
- [ ] No broken preview
- [ ] No broken form fields

---

## Summary of Changes

1. ✅ **API Response Enhancement** - `createPromoFromIdea()` now returns draft data
2. ✅ **Normalization in Helper** - `promoHelpers.ts` maps idea → headline before saving
3. ✅ **Normalization in Editor** - `ContentStudioEditor.tsx` normalizes on load (API + localStorage)
4. ✅ **Idempotent Mapping** - Only maps if headline is empty (preserves user edits)
5. ✅ **Structure Initialization** - Ensures scene1/scene2/scene3 structure exists
6. ✅ **Data Flow Documentation** - Added comments explaining the flow

---

**Implementation Complete** ✅  
**Ready for Testing** ✅

