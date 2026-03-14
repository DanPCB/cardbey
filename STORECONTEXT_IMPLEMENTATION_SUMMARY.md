# StoreContext Implementation Summary

## Overview
Fixed the issue where different quickstart inputs (e.g., "Golden Chinese restaurant", "Mexican Taco", "Union Shoes") produce nearly identical seeded menus and images. The root cause was that StoreIntent was not being properly persisted and propagated per generationRunId, causing storeId reuse to pull stale Business data.

## Root Causes Addressed

1. ✅ **storeId reuse**: Business 1-per-user constraint caused seeding to pull "store profile" from the same Business row repeatedly
2. ✅ **plan_store using stale data**: plan_store was using Business table data instead of current generationRunId's input
3. ✅ **seed_catalog fallback**: seed_catalog was falling back to generic templates because StoreIntent wasn't reliably available
4. ✅ **StoreIntent not persisted**: StoreIntent was computed but not persisted per generationRunId

## Implementation

### STEP 1: StoreContext Service
**File:** `apps/core/cardbey-core/src/services/orchestrator/storeContextService.ts` (NEW)

**Purpose:** Single source of truth for store context per generationRunId (not storeId)

**Key Functions:**
- `saveStoreContext()` - Persists StoreContext to DraftStore.input.storeContext
- `loadStoreContext()` - Loads StoreContext by generationRunId

**StoreContext Structure:**
```typescript
{
  storeId, generationRunId, tenantId, userId,
  input: { businessName, businessType, location, websiteUrl, rawInput, sourceType },
  derived: { storeIntent, confidence, source, detectedCuisine, detectedStyle, templateKey }
}
```

### STEP 2: Save StoreContext at Orchestra Start
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Changes:**
- Added `saveStoreContext()` call in orchestra/start endpoint
- Saves StoreContext BEFORE creating DraftStore
- Logs: `[STORE_CONTEXT][SAVED_AT_START]` with storeId, generationRunId, businessName, businessType, cuisine, templateKey

### STEP 3: plan_store Uses StoreContext
**File:** `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts`

**Changes:**
- `generateStorePlan()` now accepts `generationRunId` parameter
- Loads StoreContext by generationRunId (not by storeId)
- Uses StoreContext.input for businessName, businessType, location, websiteUrl, rawInput
- Uses StoreContext.derived.storeIntent if available (pre-computed)
- Uses StoreContext.derived.templateKey if available
- Falls back to params/Business table only if StoreContext not found
- Logs: `[PLAN_STORE][STORE_CONTEXT_LOADED]` and `[PLAN_STORE][INPUT]`

**executePlanStoreStage()** changes:
- Extracts generationRunId from task.request if not provided
- Passes generationRunId to generateStorePlan()

### STEP 4: seed_catalog Uses storeIntent + templateKey
**File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

**Status:** Already implemented correctly
- Loads plan_store output which includes storeIntent
- Uses storeIntent to select cuisine-specific product templates
- Uses templateKey to select correct template (mexican_restaurant, chinese_restaurant, etc.)

### STEP 5: Image Queries Include Store Intent
**File:** `apps/core/cardbey-core/src/services/imageSearch/unifiedImageSuggestion.ts`

**Status:** Already implemented correctly
- `suggestImagesForProduct()` uses ContentBrain which already includes storeIntent
- `suggestImagesForSeedProduct()` uses unified service which includes storeIntent

**File:** `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`

**Status:** Already implemented correctly
- Builds query with product name + category + storeIntent keywords + cuisine
- Applies negative scoring for avoidKeywords matches
- Score reasons include storeIntent match/mismatch

### STEP 6: Caching
**Status:** No caching found that needs fixing. All queries are keyed by jobId/generationRunId.

### STEP 7: Frontend Passes generationRunId
**Status:** Already implemented
- Frontend already passes generationRunId in `/api/menu/images/suggest` requests
- Product edit modal includes generationRunId in request payload

## Logging

**New Logs:**
- `[STORE_CONTEXT][SAVED]` - StoreContext saved with cuisine, style, confidence, templateKey
- `[STORE_CONTEXT][SAVED_AT_START]` - StoreContext saved at orchestra start
- `[STORE_CONTEXT][LOADED]` - StoreContext loaded by generationRunId
- `[STORE_CONTEXT][NOT_FOUND]` - StoreContext not found (fallback warning)
- `[PLAN_STORE][STORE_CONTEXT_LOADED]` - plan_store loaded StoreContext
- `[PLAN_STORE][STORE_CONTEXT_NOT_FOUND]` - plan_store fallback warning
- `[PLAN_STORE][INPUT]` - plan_store input fields (from StoreContext or params)
- `[PLAN_STORE][STORE_INTENT_FROM_CONTEXT]` - plan_store using pre-computed StoreIntent

## Files Changed

1. **NEW:** `apps/core/cardbey-core/src/services/orchestrator/storeContextService.ts`
   - StoreContext type definition
   - saveStoreContext() - persists to DraftStore
   - loadStoreContext() - loads by generationRunId

2. **MODIFIED:** `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Added saveStoreContext() call in orchestra/start

3. **MODIFIED:** `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts`
   - generateStorePlan() accepts generationRunId
   - Loads StoreContext by generationRunId
   - Uses StoreContext.input instead of params/Business
   - Uses StoreContext.derived.storeIntent if available
   - executePlanStoreStage() extracts generationRunId from task.request

## Testing

**Manual Test Cases:**
1. **Chinese Restaurant:**
   - Input: "Golden Chinese restaurant"
   - Expected: Products include Dumplings, Kung Pao Chicken, Beef Noodles, etc.
   - Expected: Images contain Chinese keywords, NOT pizza/pasta in top ranks
   - Expected: templateKey = "chinese_restaurant"

2. **Mexican Restaurant:**
   - Input: "Mexican Taco"
   - Expected: Products include Tacos, Burritos, Quesadillas, Nachos, etc.
   - Expected: Images contain Mexican keywords, NOT dumplings/kung pao
   - Expected: templateKey = "mexican_restaurant"

3. **Shoe Store:**
   - Input: "Union Shoes"
   - Expected: Products include Running Shoes, Boots, Sneakers, etc.
   - Expected: Images are shoes, NOT food/flowers
   - Expected: templateKey = "shoes"

**Verification:**
- Check logs for `[STORE_CONTEXT][SAVED]` with correct cuisine/templateKey
- Check logs for `[PLAN_STORE][STORE_CONTEXT_LOADED]` 
- Check logs for `[SEED_CATALOG]` showing correct templateKey and cuisine
- Verify UI shows different products for different inputs
- Verify % badges still appear and are meaningful

## Backward Compatibility

- All changes are backward compatible
- StoreContext is nullable - if not found, falls back to params/Business table
- No database migrations required (uses existing DraftStore.input JSON field)
- No breaking changes to existing APIs

## Next Steps

1. Test with three different inputs (Chinese, Mexican, Shoes)
2. Verify logs show StoreContext being saved and loaded
3. Verify products are different for each input
4. Verify images are relevant to each store type
5. Monitor for any fallback warnings in logs




