# Mismatch Fixes Summary

## ✅ Fixed: Goal Mapping Mismatch (P0)

**Problem:** Frontend always sent `goal: 'build_store'` regardless of `sourceType`, causing OCR and URL modes to use generic service instead of specialized ones.

**Fix Applied:**
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:760-767`
- **Change:** Added `GOAL_MAP` table that maps `sourceType` → `goal`:
  ```typescript
  const GOAL_MAP: Record<string, string> = {
    'form': 'build_store',
    'voice': 'build_store',
    'ocr': 'build_store_from_menu',
    'url': 'build_store_from_website',
    'template': 'build_store_from_template',
  };
  const mappedGoal = GOAL_MAP[payload.sourceType] || 'build_store';
  orchestraPayload.goal = mappedGoal;
  ```

**Result:**
- ✅ OCR mode now sends `goal: 'build_store_from_menu'` → routes to `menuImportStoreService`
- ✅ URL mode now sends `goal: 'build_store_from_website'` → routes to `websiteImportStoreService`
- ✅ Form/Voice still send `goal: 'build_store'` → routes to `buildStoreService`

**Acceptance Test:**
1. Select OCR mode → Generate
2. Check Network tab: `POST /api/mi/orchestra/start` body should have `goal: 'build_store_from_menu'`
3. Select URL mode → Generate
4. Check Network tab: `POST /api/mi/orchestra/start` body should have `goal: 'build_store_from_website'`

---

## 🟡 Partial: Template Option UI (P1)

**Problem:** Backend supports `build_store_from_template` but UI has no template option.

**Fixes Applied:**
1. **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`
   - Added `'template'` to `StartMode` type (line 47)
   - Added `FileText` icon import (line 40)
   - Added template mode button in mode selector (after line 1305)

2. **File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`
   - Added `'template'` to `QuickStartPayload.sourceType` (line 104)
   - Added `templateKey?: string` to payload interface (line 109)
   - Added template case in payload builder (line 726-733)
   - Added template handling in orchestra payload (line 813-816)

**Remaining Work:**
- ❌ **Template picker UI not implemented** - Currently template mode button exists but no template selection UI
- ❌ **Template selection state** - No state variable to store selected template
- ❌ **Template validation** - No check to ensure template is selected before Generate

**Next Steps:**
1. Add `selectedTemplateKey` state in `FeaturesPage.tsx`
2. Add template picker UI (can reuse `TemplateCategorySlider` or create simple dropdown)
3. Load templates from `/api/mi/orchestrator/templates/suggestions` or similar
4. Validate template is selected before allowing Generate
5. Pass `templateKey` in payload

**Acceptance Test:**
1. Click template mode button → template picker appears
2. Select template → `selectedTemplateKey` is set
3. Click Generate → `POST /api/mi/orchestra/start` includes `goal: 'build_store_from_template'` and `request.templateKey`

---

## ❌ Not Fixed: Smart Object UI (P2)

**Problem:** Backend fully implemented but no dashboard UI exists.

**Status:** Not implemented in this pass (requires new component creation)

**Required Work:**
1. Create `SmartObjectCreator.tsx` component
2. Add "Create Smart Object" button in `StoreDraftReview.tsx` (product card hover or toolbar)
3. Implement SmartObject creation flow:
   - Call `POST /api/smart-objects` with `{storeId, productId?}`
   - Display QR code from response
   - Add "Bind Promotion" button
4. Implement promo binding flow:
   - Call `POST /api/smart-objects/:id/active-promo` with `{promoId, promoType}`

**Estimated Time:** 2-3 hours

---

## Summary

| Mismatch | Status | Files Changed | Remaining Work |
|----------|--------|---------------|----------------|
| **Goal Mapping** | ✅ **FIXED** | `quickStart.ts` | None |
| **Template Option** | 🟡 **PARTIAL** | `FeaturesPage.tsx`, `quickStart.ts` | Template picker UI + state |
| **Smart Object UI** | ❌ **NOT FIXED** | None | New component creation |

---

## Testing Checklist

### Goal Mapping (P0) ✅
- [ ] OCR mode sends `goal: 'build_store_from_menu'`
- [ ] URL mode sends `goal: 'build_store_from_website'`
- [ ] Form mode still sends `goal: 'build_store'`
- [ ] Review page loads correct draft after OCR/URL generation

### Template Option (P1) 🟡
- [ ] Template mode button appears in mode selector
- [ ] Template picker UI loads templates
- [ ] Selecting template sets `selectedTemplateKey`
- [ ] Generate with template sends `goal: 'build_store_from_template'` + `templateKey`
- [ ] Review page loads draft created from template

### Smart Object (P2) ❌
- [ ] "Create Smart Object" button visible
- [ ] SmartObject creation works
- [ ] QR code displays
- [ ] Promo binding works

---

## Files Modified

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`
   - Added GOAL_MAP (lines 760-767)
   - Updated goal assignment (line 768)
   - Added template to QuickStartPayload interface (line 104, 109)
   - Added template case in payload builder (line 726-733)
   - Added template handling in orchestra payload (line 813-816)

2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`
   - Added 'template' to StartMode type (line 47)
   - Added FileText icon import (line 40)
   - Added template mode button (after line 1305)
   - Added template case in handleGenerateWithOptions (line 726-733)

---

## Next Steps

1. **Complete Template UI** (1-2 hours):
   - Add template picker component
   - Add selectedTemplateKey state
   - Wire template selection to payload

2. **Add Smart Object UI** (2-3 hours):
   - Create SmartObjectCreator component
   - Integrate into StoreDraftReview
   - Test end-to-end flow

3. **Verify All 4 Options Work**:
   - Test Form/Voice (should work)
   - Test OCR (should now work with correct goal)
   - Test URL (should now work with correct goal)
   - Test Template (needs picker UI first)

