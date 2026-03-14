# Image Suggestion Fix & StoreIntent Implementation Summary

## Overview
Fixed the 404 error for `/api/menu/images/suggest` and implemented a unified image suggestion pipeline with StoreIntent propagation through all generation stages.

## Changes Made

### 1. Fixed 404 Error
**Problem:** Frontend called `POST /api/menu/images/suggest` but backend returned 404.

**Solution:**
- Route was already mounted at `/api/menu/images` in `server.js` (line 666)
- Fixed dynamic import issue in `menuImagesRoutes.js` to use unified service
- Route now properly handles requests and returns image candidates with scores

**Files Changed:**
- `apps/core/cardbey-core/src/routes/menuImagesRoutes.js` - Updated to use unified image suggestion service

### 2. Unified Image Suggestion Service
**Created:** `apps/core/cardbey-core/src/services/imageSearch/unifiedImageSuggestion.ts`

**Purpose:** Single source of truth for all image suggestions:
- Product edit modal (via API endpoint)
- Store seed pipeline (direct call)
- Future: Promotion creative generation

**Functions:**
- `suggestImagesForProduct()` - Main unified function for product image suggestions
- `suggestImagesForSeedProduct()` - Optimized for seed pipeline (returns single image URL)

### 3. StoreIntent Service
**Created:** `apps/core/cardbey-core/src/services/orchestrator/storeIntentService.ts`

**Purpose:** Single source of truth for StoreIntent derivation and propagation

**Features:**
- Detects cuisine (Mexican, Chinese, Italian, etc.) from store name/description
- Detects style/vibe (fine dining, casual, street food, etc.)
- Enhances StoreIntent with cuisine-specific keywords and avoidKeywords
- Provides confidence scores and fallback reasons

### 4. StoreIntent Propagation
**Updated:** `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts`

**Changes:**
- `generateStorePlan()` now builds StoreIntent and includes it in plan output
- Plan output includes `storeIntent` field for downstream stages
- Added cuisine-specific template mappings (mexican_restaurant, chinese_restaurant, italian_restaurant)

**Updated:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

**Changes:**
- `generateSeedCatalog()` now accepts `storeIntent` parameter
- `executeSeedCatalogStage()` loads StoreIntent from plan_store output
- Image queries use StoreIntent for cuisine-specific keywords
- Added cuisine-specific product templates (Mexican, Chinese, Italian)

### 5. Cuisine-Specific Product Templates
**Added to `seedCatalogService.ts`:**
- `mexican_restaurant`: Tacos, Burritos, Quesadillas, Nachos, Guacamole, Enchiladas, Horchata, Churros, etc.
- `chinese_restaurant`: Dumplings, Kung Pao Chicken, Beef Noodles, Sweet and Sour Pork, Fried Rice, Hot Pot, Spring Rolls, Tea, Mapo Tofu, etc.
- `italian_restaurant`: Margherita Pizza, Pasta Carbonara, Risotto, Lasagna, Bruschetta, Tiramisu, Wine, Gelato, Antipasto Platter, etc.

### 6. Enhanced Logging
**Added comprehensive logging:**
- `[IMAGE_SUGGEST]` - Request logging with storeId, productId, generationRunId
- `[IMAGE_SUGGEST][RESULT]` - Result logging with candidate count and top score
- `[IMAGE_SUGGEST][SEED]` - Seed pipeline image requests
- `[PLAN_STORE][STORE_INTENT]` - StoreIntent detection and confidence
- `[PLAN_STORE][STORE_INTENT_FALLBACK]` - Fallback reasons when intent is generic
- `[SEED_CATALOG][STORE_INTENT]` - StoreIntent usage in seed catalog

## API Contract

### POST /api/menu/images/suggest

**Request:**
```json
{
  "storeId": "string (required)",
  "items": [
    {
      "itemId": "string (optional)",
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

**Response:**
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
          "score": 75,
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

## Scoring System

**Score Buckets:**
- `>= 0.90` => 100%
- `>= 0.75` => 75%
- `>= 0.60` => 60%
- `>= 0.50` => 50%
- `< 0.50` => 40%

**Scoring Factors:**
- Text relevance (product name, category, tags vs image metadata)
- Store consistency (cuisine match, avoidKeywords penalties)
- Query match strength
- Metadata availability

## StoreIntent Flow

1. **plan_store stage:**
   - Builds StoreIntent from businessName, businessType, location, websiteUrl
   - Detects cuisine and style
   - Includes StoreIntent in plan output

2. **seed_catalog stage:**
   - Loads StoreIntent from plan_store output
   - Uses StoreIntent to select cuisine-specific product templates
   - Builds image queries with cuisine keywords

3. **Image suggestion (modal/pipeline):**
   - Uses StoreIntent to score images
   - Penalizes mismatched cuisine (e.g., pizza images for Chinese restaurant)
   - Boosts images matching cuisine keywords

## Verification

### Test Script
Created `test-image-suggest-api.sh` for manual testing:
```bash
curl -X POST "http://localhost:3001/api/menu/images/suggest" \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "test-store-123",
    "items": [{
      "itemId": "product-1",
      "name": "Margherita Pizza",
      "category": "Pizza",
      "tags": ["pizza", "italian", "margherita"]
    }],
    "mode": "preview",
    "limit": 8
  }'
```

### Manual Checklist
- [ ] "Suggest images" button no longer returns 404
- [ ] UI shows % badge on each image candidate
- [ ] Shoes store returns shoe-related images (not flowers/food)
- [ ] Mexican restaurant gets Mexican products (Tacos, Burritos, etc.)
- [ ] Chinese restaurant gets Chinese products (Dumplings, Noodles, etc.)
- [ ] Italian restaurant gets Italian products (Pizza, Pasta, etc.)
- [ ] Feedback endpoint logs user selections

## Files Changed

1. `apps/core/cardbey-core/src/routes/menuImagesRoutes.js` - Updated to use unified service
2. `apps/core/cardbey-core/src/services/imageSearch/unifiedImageSuggestion.ts` - NEW: Unified image suggestion service
3. `apps/core/cardbey-core/src/services/orchestrator/storeIntentService.ts` - NEW: StoreIntent service
4. `apps/core/cardbey-core/src/services/orchestrator/planStoreService.ts` - Added StoreIntent to plan output
5. `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts` - Added cuisine templates and StoreIntent usage
6. `apps/core/cardbey-core/test-image-suggest-api.sh` - NEW: Test script

## Why 404 Happened

The route was mounted correctly, but there was a dynamic import issue in `menuImagesRoutes.js` that prevented the TypeScript module from loading properly. The fix was to use the unified service which handles the import correctly.

## Prevention

- Single source of truth: All image suggestions go through `unifiedImageSuggestion.ts`
- StoreIntent propagation: Intent flows from plan_store → seed_catalog → image suggestions
- Comprehensive logging: All requests logged with storeId + generationRunId
- Type safety: TypeScript interfaces ensure correct data flow


