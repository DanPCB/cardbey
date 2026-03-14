# Image Suggestions Workflow Fix - Summary

## Overview
Fixed and completed the "Suggest images" workflow with improved relevance, scoring, and store-level intent integration.

## Files Changed

### Backend (Core)
1. **`apps/core/cardbey-core/src/routes/menuImagesRoutes.js`** (MODIFIED)
   - Added `[SUGGEST_IMAGES][REQ]` and `[SUGGEST_IMAGES][RESULT]` logging
   - Added `POST /api/menu/images/feedback` endpoint for user feedback
   - Added `reasons` array to candidate response
   - Improved error handling

2. **`apps/core/cardbey-core/src/mi/contentBrain/imageScoring.ts`** (MODIFIED)
   - Updated score bucket mapping:
     - >=90 => 100%
     - >=75 => 75%
     - >=60 => 60%
     - >=50 => 50%
     - else => 40%

3. **`apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`** (MODIFIED)
   - Improved query building with fallback ladder:
     - Ladder 1: Enhanced query with store context (e.g., "shoe store product hero image sneakers lifestyle studio")
     - Ladder 2: productName + "product photo"
     - Ladder 3: category + businessType + "product photo"
     - Ladder 4: businessType + "store interior"
   - Added query ladder logging: `[SEED_CATALOG][IMAGE_QUERY]`

4. **`apps/core/cardbey-core/src/mi/contentBrain/storeIntentProfile.ts`** (NEW)
   - Store-level intent profile system
   - `getStoreIntentProfile()` - Get or create profile
   - `deriveStoreIntentProfile()` - Derive from business data

5. **`apps/core/cardbey-core/test-image-suggestions.js`** (NEW)
   - Minimal integration test script

### Frontend (Dashboard)
1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`** (MODIFIED)
   - Fixed score badge positioning (top-left)
   - Added color-coded badges (green/blue/yellow/orange/red)
   - Added feedback logging when user selects image
   - Removed duplicate badge

## API Endpoints

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

**Response:**
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
          "score": 100 | 75 | 60 | 50 | 40,
          "scoreLabel": "100%",
          "reasons": ["+keyword match: pizza", "+store type match", "-mismatch: italian food"],
          "scoreDetails": { ... }
        }
      ]
    }
  ],
  "failed": [],
  "queryUsed": "string",
  "provider": "pexels"
}
```

### POST /api/menu/images/feedback
**Request:**
```json
{
  "storeId": "string (required)",
  "productId": "string (required)",
  "chosenUrl": "string (required)",
  "score": 0.85 (optional),
  "scorePercent": 100 (optional),
  "reasons": ["string"] (optional),
  "rejectedTopUrls": ["string"] (optional),
  "generationRunId": "string (optional)"
}
```

## Scoring System

### Score Calculation
- **Text Relevance**: Keyword matching between product text and image metadata
- **Store Match**: Consistency with store type/keywords
- **Mismatch Penalties**: Heavy penalty for avoidKeywords (e.g., pizza for Chinese restaurant)
- **Category Match**: Bonus for category matches

### Score Buckets
- **100%**: score >= 90 (excellent match)
- **75%**: score >= 75 (good match)
- **60%**: score >= 60 (fair match)
- **50%**: score >= 50 (acceptable match)
- **40%**: score < 50 (poor match)

### Scoring Reasons
Examples:
- `+keyword match: pizza, pasta`
- `+store type match`
- `+category match: Main Course`
- `-mismatch: italian food`

## Store Creation Pipeline Improvements

### Query Building for Shoes Stores
**Before:**
```
"Running Shoes"
```

**After (Ladder 1):**
```
"Running Shoes Union Shoes shoe store product hero image sneakers lifestyle studio"
```

**Fallback Ladder:**
1. Enhanced query with store context
2. `productName + "product photo"`
3. `category + businessType + "product photo"`
4. `businessType + "store interior"`

### Logging
```
[SEED_CATALOG][IMAGE_QUERY] storeId=xxx productName="Running Shoes" templateKey=shoes queryLadder=1 query="..." result=found
```

## Logging Format

### Request Logging
```
[SUGGEST_IMAGES][REQ] storeId=xxx itemsCount=1 mode=preview generationRunId=yyy
```

### Result Logging
```
[SUGGEST_IMAGES][RESULT] storeId=xxx count=1 topScore=85% generationRunId=yyy
```

### Feedback Logging
```
[SUGGEST_IMAGES][FEEDBACK] storeId=xxx productId=yyy chosenUrl="..." score=85% generationRunId=zzz
```

## UI Improvements

### Score Badge
- Position: Top-left corner of image
- Colors:
  - Green (100%): score >= 90
  - Blue (75%): score >= 75
  - Yellow (60%): score >= 60
  - Orange (50%): score >= 50
  - Red (40%): score < 50

### Candidate Sorting
- Sorted by score descending (best match first)

## Store-Level Intent Profile

### Purpose
Single source of truth for store-level intent that drives:
- Product naming
- Category selection
- Image query construction
- Promotion writing tone

### Structure
```typescript
interface StoreIntentProfile {
  storeId: string;
  generationRunId?: string;
  storeIntent: StoreIntent; // businessType, keywords, avoidKeywords, tone, etc.
  createdAt: Date;
  updatedAt: Date;
}
```

### Usage
- Created during `plan_store` stage
- Used by `seed_catalog` for image queries
- Used by promotion copy generation
- Future: Used by video generation

## Testing

### Manual Test Script
```bash
node apps/core/cardbey-core/test-image-suggestions.js
```

### Test Cases
1. **Margherita Pizza** under restaurant store
   - Should return pizza images with score >= 75%
   - Should not return Chinese food images

2. **Running Shoes** under shoes store
   - Should return shoe images with score >= 75%
   - Should not return food/flower images

3. **Store Mismatch**
   - Product from different store should return error

## Verification Checklist

- [x] Endpoint `/api/menu/images/suggest` exists and is mounted
- [x] Frontend calls correct endpoint
- [x] Score badges display correctly (100%, 75%, 60%, 50%, 40%)
- [x] Candidates sorted by score descending
- [x] Logging includes storeId and generationRunId
- [x] Shoes store gets relevant images
- [x] Feedback endpoint logs user selections
- [x] Store drift prevention works
- [x] Query ladder works for seed catalog

## Next Steps

1. **Store Intent Profile Persistence**: Add database table for store intent profiles
2. **Vision API Integration**: Replace placeholder visionRelevance with actual vision analysis
3. **A/B Testing**: Track which score thresholds work best
4. **User Feedback Loop**: Use feedback to improve scoring weights




