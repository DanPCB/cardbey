# MI Content Brain v1 - Implementation Summary

## Overview
Unified image suggestion system with intent-based matching, store drift prevention, and comprehensive telemetry.

## Files Changed

### Backend (Core)
1. **`apps/core/cardbey-core/src/mi/contentBrain/types.ts`** (NEW)
   - Type definitions for StoreIntent, ProductIntent, ImageCandidate, etc.

2. **`apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`** (NEW)
   - `inferStoreIntent()` - Infers store context from business data
   - Detects store type (chinese_restaurant, coffee_shop, florist, shoe_store, etc.)
   - Generates keywords and avoidKeywords based on store type

3. **`apps/core/cardbey-core/src/mi/contentBrain/productIntent.ts`** (NEW)
   - `inferProductIntent()` - Infers product context from product data
   - Determines product type (dish, beverage, service, product)
   - Builds keywords and avoidKeywords

4. **`apps/core/cardbey-core/src/mi/contentBrain/imageScoring.ts`** (NEW)
   - `scoreImage()` - Scores images based on intent
   - Confidence badge mapping:
     - score >= 0.85 => 100%
     - 0.65-0.84 => 75%
     - 0.45-0.64 => 50%
     - else => 25%

5. **`apps/core/cardbey-core/src/mi/contentBrain/suggestImages.ts`** (NEW)
   - `suggestImages()` - Main entry point
   - Improved query building (product name > category > storeType/cuisine > tags)
   - Store drift prevention (verifies product belongs to store)
   - Candidate deduplication (avoids same photographer/URL/ID)
   - Telemetry logging (ActivityEvent + SuggestionLog)

6. **`apps/core/cardbey-core/src/mi/contentBrain/index.ts`** (NEW)
   - Main export file

7. **`apps/core/cardbey-core/src/routes/menuImagesRoutes.js`** (NEW)
   - `POST /api/menu/images/suggest` - Image suggestions endpoint
   - `POST /api/menu/images/select` - User selection telemetry endpoint

8. **`apps/core/cardbey-core/src/server.js`** (MODIFIED)
   - Added route mounting: `app.use('/api/menu/images', menuImagesRoutes)`

### Frontend (Dashboard)
1. **`apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`** (MODIFIED)
   - Added `logImageSelection()` function for telemetry

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`** (MODIFIED)
   - Added telemetry logging when user selects an image

## API Contract

### POST /api/menu/images/suggest

**Request:**
```json
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
  "aspect": "16:10" | "1:1" | "9:16" (optional),
  "mode": "preview" | "normal" (default: "normal"),
  "generationRunId": "string (optional)"
}
```

**Response (preview mode):**
```json
{
  "ok": true,
  "updated": [
    {
      "itemId": "string",
      "candidates": [
        {
          "url": "string",
          "thumbUrl": "string",
          "source": "pexels",
          "id": "string",
          "photographer": "string",
          "score": 100 | 75 | 50 | 25,
          "scoreDetails": {
            "textRelevance": 85,
            "visionRelevance": 70,
            "storeConsistency": 95,
            "audienceFit": 70,
            "aestheticQuality": 75
          }
        }
      ],
      "confidence": 0.85
    }
  ],
  "failed": [],
  "queryUsed": "string",
  "provider": "pexels"
}
```

**Response (normal mode):**
```json
{
  "ok": true,
  "updated": [
    {
      "itemId": "string",
      "imageUrl": "string",
      "attribution": "string",
      "confidence": 0.85,
      "score": 100
    }
  ],
  "failed": []
}
```

### POST /api/menu/images/select

**Request:**
```json
{
  "storeId": "string (required)",
  "productId": "string (required)",
  "imageUrl": "string (required)",
  "score": 0.85 (optional),
  "scorePercent": 100 (optional)
}
```

**Response:**
```json
{
  "ok": true
}
```

## Key Features

### 1. Improved Query Building
- Priority: product name > category > storeType/cuisine > top tags
- Includes store context (e.g., "chinese" for Chinese restaurant)
- Avoids duplicate keywords

### 2. Store Drift Prevention
- Verifies product belongs to storeId before suggesting
- Returns error if mismatch detected
- Logs `[CONTENT_BRAIN][STORE_MISMATCH]` events

### 3. Candidate Diversity
- Deduplicates by photographer, URL, and ID
- Ensures mix of different sources
- Prevents near-duplicate suggestions

### 4. Confidence Badge Mapping
- **100%**: score >= 0.85 (excellent match)
- **75%**: score 0.65-0.84 (good match)
- **50%**: score 0.45-0.64 (fair match)
- **25%**: score < 0.45 (poor match)

### 5. Telemetry
- **ActivityEvent**: Logs `content_brain_image_suggest` and `content_brain_user_selected_image`
- **SuggestionLog**: Tracks suggestions with confidence scores
- Includes storeId, productId, generationRunId, scores, and candidate URLs

## Verification Steps

### 1. Test Endpoint with curl
```bash
curl -X POST http://localhost:3000/api/menu/images/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "your-store-id",
    "items": [{
      "itemId": "product-id",
      "name": "Kung Pao Chicken",
      "category": "Main Course",
      "tags": ["spicy", "chinese"]
    }],
    "mode": "preview",
    "aspect": "16:10"
  }'
```

### 2. Test Store Mismatch Prevention
```bash
# Use a productId that belongs to a different store
curl -X POST http://localhost:3000/api/menu/images/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "store-1",
    "items": [{
      "itemId": "product-from-different-store",
      "name": "Test Product"
    }],
    "mode": "preview"
  }'
# Should return error if product doesn't belong to store
```

### 3. Test User Selection Logging
```bash
curl -X POST http://localhost:3000/api/menu/images/select \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "store-id",
    "productId": "product-id",
    "imageUrl": "https://...",
    "scorePercent": 85
  }'
```

### 4. UI Verification
1. Open product edit drawer
2. Click "Suggest images"
3. Verify candidates show with score badges (100%, 75%, 50%, 25%)
4. Select an image
5. Check server logs for `[CONTENT_BRAIN][USER_SELECTED_IMAGE]`
6. Verify ActivityEvent and SuggestionLog entries in database

### 5. Store Type Mismatch Test
1. Create a Chinese restaurant store
2. Add product "Kung Pao Chicken"
3. Request image suggestions
4. Verify pizza/pasta images are scored low or excluded
5. Check logs for mismatch penalties

## Logging Format

### Image Suggestions
```
[CONTENT_BRAIN][SUGGEST_IMAGES] storeId=xxx productId=yyy productName="Kung Pao Chicken" query="kung pao chicken chinese main course" provider=pexels strategy=intent_based candidates=8 topScore=85% generationRunId=zzz
```

### Store Mismatch
```
[CONTENT_BRAIN][STORE_MISMATCH] storeId=xxx productId=yyy productStoreId=zzz error=store_mismatch
```

### User Selection
```
[CONTENT_BRAIN][USER_SELECTED_IMAGE] storeId=xxx productId=yyy imageUrl="https://..." score=85%
```

## Database Tables Used

- **ActivityEvent**: `type='content_brain_image_suggest'` or `'content_brain_user_selected_image'`
- **SuggestionLog**: `node='store:{storeId}:product:{productId}'`, `title='Image suggestions generated'` or `'User selected image'`
- **Product**: Updated with `imageUrl` in normal mode
- **Business**: Loaded for store intent inference

## Notes

- All telemetry is non-blocking (errors don't fail the request)
- Store drift prevention returns error but doesn't throw
- Candidate deduplication ensures diversity
- Confidence badges use fixed thresholds (not rounded percentages)
- Query building prioritizes product name for best relevance




