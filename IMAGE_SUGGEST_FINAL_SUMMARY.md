# Image Suggest Feature - Final Implementation Summary

## Overview
Implemented a reliable "Suggest images" feature that returns image candidates with confidence scores and renders them with % badges in the product edit modal.

## ✅ All Tasks Completed

### TASK 1: Backend Endpoint Mounted ✅
- **File:** `apps/core/cardbey-core/src/server.js` (line 666)
- Route mounted: `app.use('/api/menu/images', menuImagesRoutes)`
- Endpoint: `POST /api/menu/images/suggest`
- Logging: `[IMAGE_SUGGEST] storeId=... items=... generationRunId=...`

### TASK 2: Unified Image Suggestion Service ✅
- **File:** `apps/core/cardbey-core/src/services/imageSearch/unifiedImageSuggestion.ts`
- Function: `suggestImagesForProduct()`
- Returns: `{ candidates: [{ url, thumbUrl, source, id, photographer, score, scoreLabel, reasons, scoreDetails }] }`

**Scoring Implementation:**
- **textRelevance**: Matches between (name/category/tags) and candidate metadata
- **storeConsistency**: Based on StoreIntent keywords/avoidKeywords
- **Penalties**: Big penalty when candidate conflicts with store (e.g., food images in shoe store)
- **Reasons array**: Includes strings like "+keyword match: pizza", "-mismatch: taco"

### TASK 3: StoreIntent Loader ✅
- **File:** `apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`
- Uses `inferStoreIntent({ storeId })` which:
  - Attempts to load StoreIntent from StoreContext (by generationRunId)
  - Falls back to Business table if StoreContext not available
  - Derives minimal intent from store name + businessType
- Returns: `{ domain, cuisine, keywords, avoidKeywords, confidence }`
- **Non-breaking**: Falls back gracefully if StoreIntent not available

### TASK 4: Route Handler Uses Unified Service ✅
- **File:** `apps/core/cardbey-core/src/routes/menuImagesRoutes.js`
- Validates request body (storeId, items array)
- For each item, returns candidates (limit default 8)
- Response format: `{ ok: true, suggestions: [{ itemId, candidates }], failed: [] }`
- Also includes `updated` field for backward compatibility
- Logs: `[IMAGE_SUGGEST][RESULT] itemId=... count=... topScore=...`
- Logs: `[IMAGE_SUGGEST][COMPLETE] storeId=... itemsProcessed=... totalCandidates=...`

### TASK 5: Frontend Modal Flow ✅
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`
- Calls `POST /api/menu/images/suggest` with:
  - `storeId`, `generationRunId` (if draft), `items: [{ itemId, name, category, tags, description }]`, `limit: 8`, `mode: 'preview'`
- Renders candidates in grid (2 rows)
- Each candidate shows % badge from `scoreLabel` (or computed from `score`)
- Clicking candidate sets image URL field + previews it (does NOT save until user clicks Save)
- Shows loading and error states
- Logs: `[UI][IMAGE_SUGGEST]` in dev mode

### TASK 6: Observability ✅
**Backend Logs:**
- `[IMAGE_SUGGEST]` - Request received with storeId, items count, generationRunId
- `[IMAGE_SUGGEST][RESULT]` - Per-item result with count and topScore
- `[IMAGE_SUGGEST][COMPLETE]` - Final summary with itemsProcessed, totalCandidates, failed count

**Frontend Logs (dev only):**
- `[UI][IMAGE_SUGGEST]` - Starting suggest images (with productId, productName, storeId, generationRunId)
- `[UI][IMAGE_SUGGEST]` - Result received (with suggestionsCount, candidatesCount)

### TASK 7: Tests ✅
- **File:** `apps/core/cardbey-core/test-image-suggest-api.sh` (Bash)
- **File:** `apps/core/cardbey-core/test-image-suggest-api.ps1` (PowerShell)
- **File:** `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.test.ts` (Unit tests)

## Key Decisions

1. **Response Format**: Uses `suggestions` field (new) but also includes `updated` for backward compatibility
2. **Score Display**: Uses `scoreLabel` (e.g., "75%") for display, computed from `score` (0-1) or `scorePercent` (0-100)
3. **StoreIntent Loading**: Non-breaking - falls back to Business table if StoreContext not available
4. **Logging**: Consistent format `[IMAGE_SUGGEST]` prefix for easy filtering
5. **Frontend Compatibility**: Supports both `suggestions` (new) and `updated` (legacy) response fields

## Files Changed

1. **MODIFIED:** `apps/core/cardbey-core/src/routes/menuImagesRoutes.js`
   - Updated logging format to `[IMAGE_SUGGEST]`
   - Changed response to include both `suggestions` and `updated` fields
   - Added `scoreLabel` to candidates

2. **MODIFIED:** `apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`
   - Updated `ImageCandidate` interface to include `scoreLabel`, `thumbUrl`, `source`, `id`, `photographer`
   - Updated `SuggestImagesResponse` to support both `suggestions` and `updated` fields

3. **MODIFIED:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`
   - Updated to use `suggestions` field (with fallback to `updated`)
   - Updated badge to use `scoreLabel` if available (with fallback to computed from `score`)
   - Added dev-mode logging with `[UI][IMAGE_SUGGEST]` prefix

4. **NEW:** `apps/core/cardbey-core/test-image-suggest-api.ps1`
   - PowerShell test script for Windows

5. **NEW:** `apps/core/cardbey-core/src/mi/contentBrain/imageScoring.test.ts`
   - Unit tests for score bucketing and reason generation

## API Contract

### Request
```json
POST /api/menu/images/suggest
{
  "storeId": "string (required)",
  "items": [
    {
      "itemId": "string (required)",
      "name": "string (required)",
      "description": "string (optional)",
      "category": "string (optional)",
      "tags": ["string"] (optional)
    }
  ],
  "mode": "preview" | "normal" (default: "normal"),
  "aspect": "string (optional, e.g., '16:10')",
  "generationRunId": "string (optional)"
}
```

### Response
```json
{
  "ok": true,
  "suggestions": [
    {
      "itemId": "string",
      "candidates": [
        {
          "url": "string",
          "thumbUrl": "string",
          "source": "pexels",
          "id": "string",
          "photographer": "string",
          "score": 0.82,
          "scoreLabel": "75%",
          "reasons": ["+keyword match: pizza", "Business type match: restaurant"],
          "scoreDetails": {
            "textRelevance": 85,
            "visionRelevance": 70,
            "storeConsistency": 90,
            "audienceFit": 70,
            "aestheticQuality": 75
          }
        }
      ]
    }
  ],
  "failed": []
}
```

## Acceptance Criteria

✅ **No 404s**: Endpoint mounted at `/api/menu/images/suggest`
✅ **Suggestions list appears**: Frontend renders candidates in grid
✅ **% badges appear**: Badge shows `scoreLabel` (e.g., "75%") with color coding (green/orange/red)
✅ **Selecting suggestion updates preview**: Clicking candidate sets image URL and previews (does NOT save)
✅ **Save persists**: User must click Save to persist (not auto-saved)

## Testing

**Manual Test:**
1. Open product edit modal
2. Click "Suggest images"
3. Verify candidates appear in grid (2 rows)
4. Verify % badges show on each candidate with correct colors
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

## Logging Examples

**Backend:**
```
[IMAGE_SUGGEST] storeId=abc123 items=1 generationRunId=run-456
[IMAGE_SUGGEST][RESULT] itemId=product-1 count=8 topScore=75%
[IMAGE_SUGGEST][COMPLETE] storeId=abc123 itemsProcessed=1 totalCandidates=8 failed=0 generationRunId=run-456
```

**Frontend (dev only):**
```
[UI][IMAGE_SUGGEST] Starting suggest images: { productId: "product-1", productName: "Margherita Pizza", storeId: "abc123", generationRunId: "run-456" }
[UI][IMAGE_SUGGEST] Result received: { ok: true, suggestionsCount: 1, candidatesCount: 8 }
```




