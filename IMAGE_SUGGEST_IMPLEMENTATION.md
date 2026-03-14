# Image Suggest Implementation Summary

## Overview
Implemented a reliable "Suggest images" feature that returns image candidates with confidence scores and renders them with % badges in the product edit modal.

## Implementation Status

### ✅ TASK 1: Backend Endpoint Mounted
**File:** `apps/core/cardbey-core/src/server.js`
- Route mounted at `/api/menu/images` (line 666)
- Endpoint: `POST /api/menu/images/suggest`
- Logging: `[IMAGE_SUGGEST] storeId=... items=... generationRunId=...`

### ✅ TASK 2: Unified Image Suggestion Service
**File:** `apps/core/cardbey-core/src/services/imageSearch/unifiedImageSuggestion.ts`
- `suggestImagesForProduct()` - Main unified function
- Returns candidates with score, scoreLabel, reasons, scoreDetails
- Uses ContentBrain for intent-based scoring

**Scoring Implementation:**
- **textRelevance**: Matches between (name/category/tags) and candidate metadata
- **storeConsistency**: Based on StoreIntent keywords/avoidKeywords
- **Penalties**: Big penalty when candidate conflicts with store (e.g., food images in shoe store)
- **Reasons array**: Includes strings like "+keyword match: pizza", "-mismatch: taco"

### ✅ TASK 3: StoreIntent Loader
**File:** `apps/core/cardbey-core/src/services/orchestrator/storeIntentService.ts`
- `getStoreIntentForStore()` - Loads StoreIntent for storeId
- Falls back to deriving minimal intent from store name + businessType
- Returns: `{ domain, cuisine, keywords, avoidKeywords, confidence }`

**File:** `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`
- Uses `inferStoreIntent()` which loads from StoreContext or derives from Business table
- Non-breaking: Falls back gracefully if StoreIntent not available

### ✅ TASK 4: Route Handler Uses Unified Service
**File:** `apps/core/cardbey-core/src/routes/menuImagesRoutes.js`
- Validates request body (storeId, items array)
- For each item, returns candidates (limit default 8)
- Response format: `{ ok: true, suggestions: [{ itemId, candidates }], failed: [] }`
- Logs: `[IMAGE_SUGGEST][RESULT] itemId=... count=... topScore=...`
- Logs: `[IMAGE_SUGGEST][COMPLETE] storeId=... itemsProcessed=... totalCandidates=...`

### ✅ TASK 5: Frontend Modal Flow
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`
- Calls `POST /api/menu/images/suggest` with:
  - `storeId`, `generationRunId` (if draft), `items: [{ itemId, name, category, tags, description }]`, `limit: 8`, `mode: 'preview'`
- Renders candidates in grid (2 rows)
- Each candidate shows % badge from `scoreLabel` (or computed from `score`)
- Clicking candidate sets image URL field + previews it (does NOT save until user clicks Save)
- Shows loading and error states
- Logs: `[UI][IMAGE_SUGGEST]` in dev mode

### ✅ TASK 6: Observability
**Backend Logs:**
- `[IMAGE_SUGGEST]` - Request received
- `[IMAGE_SUGGEST][RESULT]` - Per-item result with count and topScore
- `[IMAGE_SUGGEST][COMPLETE]` - Final summary

**Frontend Logs (dev only):**
- `[UI][IMAGE_SUGGEST]` - Starting suggest images
- `[UI][IMAGE_SUGGEST]` - Result received

### ✅ TASK 7: Tests
**File:** `apps/core/cardbey-core/test-image-suggest-api.sh` (Bash)
**File:** `apps/core/cardbey-core/test-image-suggest-api.ps1` (PowerShell)
**File:** `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.test.ts` (Unit tests)

## Key Decisions

1. **Response Format**: Changed from `updated` to `suggestions** for clarity, but kept `updated` for backward compatibility
2. **Score Display**: Uses `scoreLabel` (e.g., "75%") for display, computed from `score` (0-1) or `scorePercent` (0-100)
3. **StoreIntent Loading**: Non-breaking - falls back to Business table if StoreContext not available
4. **Logging**: Consistent format `[IMAGE_SUGGEST]` prefix for easy filtering
5. **Frontend Compatibility**: Supports both `suggestions` (new) and `updated` (legacy) response fields

## Files Changed

1. **MODIFIED:** `apps/core/cardbey-core/src/routes/menuImagesRoutes.js`
   - Updated logging format
   - Changed response to use `suggestions` field
   - Added `scoreLabel` to candidates

2. **MODIFIED:** `apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`
   - Updated `ImageCandidate` interface to include `scoreLabel`, `thumbUrl`, `source`, `id`, `photographer`
   - Updated `SuggestImagesResponse` to support both `suggestions` and `updated` fields

3. **MODIFIED:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`
   - Updated to use `suggestions` field (with fallback to `updated`)
   - Updated badge to use `scoreLabel` if available
   - Added dev-mode logging

4. **NEW:** `apps/core/cardbey-core/test-image-suggest-api.ps1`
   - PowerShell test script for Windows

5. **NEW:** `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.test.ts`
   - Unit tests for score bucketing

## Acceptance Criteria

✅ **No 404s**: Endpoint mounted at `/api/menu/images/suggest`
✅ **Suggestions list appears**: Frontend renders candidates in grid
✅ **% badges appear**: Badge shows `scoreLabel` (e.g., "75%") with color coding
✅ **Selecting suggestion updates preview**: Clicking candidate sets image URL and previews
✅ **Save persists**: User must click Save to persist (not auto-saved)

## Testing

**Manual Test:**
1. Open product edit modal
2. Click "Suggest images"
3. Verify candidates appear in grid
4. Verify % badges show on each candidate
5. Click a candidate - verify preview updates
6. Click Save - verify image persists

**API Test:**
```bash
# Bash
./test-image-suggest-api.sh

# PowerShell
.\test-image-suggest-api.ps1
```

**Unit Tests:**
```bash
npm test -- imageScoring.test.ts
```




