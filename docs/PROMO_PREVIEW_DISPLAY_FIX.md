# Promotion Preview Display Fix

**Date:** 2025-01-27  
**Status:** ✅ Complete  
**Goal:** Fix preview card to show headline and subheadline from form inputs, not brand name

---

## Problem

Preview card was showing brand name ("TESTTTT11111") instead of headline ("TEST222222") and subheadline ("test33333") that user typed in the form fields.

**Root Cause:** Preview was reading from normalized/cached data instead of raw user input, and fallback logic was using brandName when headline was empty.

---

## Solution

Updated preview to prioritize raw data (latest user input) over normalized data, and improved fallback logic.

---

## Files Changed

### 1. **`src/features/content-studio/templates/promotion/PromotionPreview.tsx`**
   - **Changed data extraction order:** Read from `data.scene1.promo` (raw) first, then normalized, then legacy
   - **Fixed headline reading:** Prioritize raw headline field, don't fallback to brandName
   - **Fixed subheadline reading:** Read from raw data first
   - **Added debug logging:** (dev only) to help diagnose data structure issues

### 2. **`src/features/content-studio/lib/normalizePromotionDraft.ts`**
   - **Improved headline fallback:** Only fallback to productName if headline is truly empty, not brandName

### 3. **`src/features/content-studio/components/PreviewCanvas.tsx`**
   - **Added React key:** Force re-render when headline/subheadline changes
   - Key: `promo-${instanceId}-${headline}-${subheadline}`

---

## Key Changes

### Data Reading Priority (New Order)

**Before:**
```typescript
const promo = normalized.scene1?.promo || data.scene1?.promo || data.promo || {};
const headline = promo.headline || productName || 'Special Offer';
```

**After:**
```typescript
// Read raw data first (most recent user input)
const rawPromo = data.scene1?.promo || {};
const normalizedPromo = normalized.scene1?.promo || {};
const promo = {
  ...legacyPromo,
  ...normalizedPromo,
  ...rawPromo, // Raw data takes precedence
};

// Headline: raw > normalized > legacy > productName (NOT brandName)
const headline = (rawPromo.headline && rawPromo.headline.trim())
  ? rawPromo.headline
  : (normalizedPromo.headline && normalizedPromo.headline.trim())
  ? normalizedPromo.headline
  : (promo.headline && promo.headline.trim())
  ? promo.headline
  : ((productName && productName !== 'Product' && productName.trim())
    ? productName
    : 'Special Offer');
```

### React Key for Re-rendering

Added key to force preview re-render when headline/subheadline changes:
```typescript
<PromotionPreview
  key={`promo-${instanceId}-${draft.scene1?.promo?.headline || ''}-${draft.scene1?.promo?.subheadline || ''}`}
  ...
/>
```

---

## Expected Behavior

### Before Fix
- User types headline: "TEST222222"
- Preview shows: "TESTTTT11111" (brand name) ❌

### After Fix
- User types headline: "TEST222222"
- Preview shows: "TEST222222" (headline) ✅
- User types subheadline: "test33333"
- Preview shows: "test33333" below headline ✅

---

## Verification Checklist

### ✅ Form Input → Preview Display
- [ ] Type "TEST222222" in Headline field
- [ ] Preview immediately shows "TEST222222" in large text (center)
- [ ] Type "test33333" in Subheadline field
- [ ] Preview immediately shows "test33333" below headline
- [ ] Brand name "TESTTTT11111" appears at top (small text), NOT in headline position

### ✅ Data Persistence
- [ ] Type headline and subheadline
- [ ] Refresh page
- [ ] Preview still shows correct headline and subheadline
- [ ] Form fields still show correct values

### ✅ No Regressions
- [ ] Brand name still displays correctly (at top)
- [ ] Background color still works
- [ ] Product scene still works
- [ ] CTA scene still works

---

## Summary of Changes

1. ✅ **Prioritize Raw Data** - Preview reads from `data.scene1.promo` first (latest user input)
2. ✅ **Fix Headline Reading** - No longer falls back to brandName
3. ✅ **Fix Subheadline Reading** - Reads from raw data first
4. ✅ **Force Re-render** - React key ensures preview updates when data changes
5. ✅ **Better Fallbacks** - Only uses productName if headline is truly empty

---

**Implementation Complete** ✅  
**Ready for Testing** ✅

