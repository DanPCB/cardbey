# Promotion Copy Generation - Implementation Summary

## Overview
Extended ContentBrain to generate promotion copy (headlines, descriptions, CTAs) with the same intent-based system used for images. Includes video generation stubs for future implementation.

## Files Changed

### Backend (Core)
1. **`apps/core/cardbey-core/src/mi/contentBrain/promotionCopy.ts`** (NEW)
   - `suggestPromotionCopy()` - Main entry point for promotion copy generation
   - `generateVariant()` - Generates individual copy variants with scoring
   - Uses storeIntent + productIntent from ContentBrain
   - Includes mismatch guardrails (no wrong cuisine/product)
   - Logs to ActivityEvent and SuggestionLog

2. **`apps/core/cardbey-core/src/mi/contentBrain/videoStubs.ts`** (NEW)
   - `suggestStoryboard()` - TODO stub for video storyboard generation
   - `scoreStoryboard()` - TODO stub for video scoring
   - `CampaignIntent` interface for shared intent across promotions/videos

3. **`apps/core/cardbey-core/src/mi/contentBrain/index.ts`** (MODIFIED)
   - Exports promotion copy and video stub functions

4. **`apps/core/cardbey-core/src/routes/miRoutes.js`** (MODIFIED)
   - Added `POST /api/mi/promo/suggest-copy` endpoint

### Frontend (Dashboard)
1. **`apps/dashboard/cardbey-marketing-dashboard/src/api/promoCopy.ts`** (NEW)
   - `suggestPromotionCopy()` - API client for fetching copy suggestions
   - TypeScript interfaces for request/response

## API Contract

### POST /api/mi/promo/suggest-copy

**Request:**
```json
{
  "storeId": "string (required)",
  "productId": "string (optional)",
  "productName": "string (optional, required if productId missing)",
  "productDescription": "string (optional)",
  "category": "string (optional)",
  "tags": ["string"] (optional),
  "goal": "increase_orders" | "increase_visits" | "clear_inventory" | "launch_product" | "seasonal_promotion" (required),
  "channel": "store_page" | "social_media" | "email" | "sms" | "display_ad" (required),
  "tone": "friendly" | "professional" | "urgent" | "playful" | "luxury" (optional, default: "friendly"),
  "limit": 3 (optional, default: 3),
  "generationRunId": "string (optional)"
}
```

**Response:**
```json
{
  "ok": true,
  "variants": [
    {
      "headline": "Order Kung Pao Chicken Now",
      "body": "Try our delicious Kung Pao Chicken. Perfect for chinese restaurant lovers.",
      "cta": "Order Now",
      "hashtags": ["#MainCourse", "chinese", "chineserestaurant"] (optional, for social_media),
      "scorePercent": 100 | 75 | 50 | 25,
      "reasons": ["+direct product focus", "+store type match", "-mismatch: italian food"]
    }
  ],
  "debug": {
    "storeIntent": { ... },
    "productIntent": { ... },
    "goal": "increase_orders",
    "channel": "social_media",
    "tone": "friendly"
  }
}
```

## Key Features

### 1. Intent-Based Copy Generation
- Uses same `storeIntent` and `productIntent` as image suggestions
- Generates 3 variants with different angles:
  - Variant 0: Direct product focus
  - Variant 1: Benefit-focused
  - Variant 2: Urgency/Scarcity or Store-specific

### 2. Goal-Based Messaging
- **increase_orders**: "Order Now" CTAs, urgency messaging
- **launch_product**: "New: {product}" headlines
- **clear_inventory**: "Limited Time" messaging
- **seasonal_promotion**: Time-sensitive offers

### 3. Channel Adaptation
- **social_media**: Includes hashtags, shorter copy
- **email**: More detailed body text
- **store_page**: Store-specific messaging
- **display_ad**: Concise, attention-grabbing

### 4. Tone Adjustment
- **friendly**: Adds emojis, exclamation marks
- **urgent**: Uppercase, action-oriented
- **luxury**: "Premium" language, refined tone
- **professional**: Business-focused
- **playful**: Casual, fun language

### 5. Mismatch Guardrails
- Checks for avoidKeywords in generated copy
- Penalizes mismatches (e.g., Chinese restaurant + "pizza")
- Ensures store type consistency

### 6. Quality Scoring
- Same confidence badge mapping as images:
  - score >= 0.85 => 100%
  - 0.65-0.84 => 75%
  - 0.45-0.64 => 50%
  - else => 25%
- Provides reasons for scoring

### 7. Telemetry
- **ActivityEvent**: `type='content_brain_promo_copy_suggest'`
- **SuggestionLog**: Tracks suggestions with confidence scores
- Includes storeId, productId, goal, channel, tone, variantCount, topScore

### 8. Store Drift Prevention
- Verifies product belongs to storeId
- Returns error if mismatch detected
- Logs `[CONTENT_BRAIN][PROMO_COPY][STORE_MISMATCH]` events

## Video Generation Stubs

### CampaignIntent Interface
```typescript
interface CampaignIntent {
  storeIntent: StoreIntent;
  productIntent: ProductIntent;
  goal: string;
  channel: string;
  tone: string;
}
```

### TODO Functions
- `suggestStoryboard(campaignIntent, options)` - Generate video storyboard
- `scoreStoryboard(storyboard, campaignIntent)` - Score video quality

These will use the same intent system when implemented.

## Integration Points

### Frontend Hook (To Be Implemented)
When user clicks "Create Smart Promotion":
1. Fetch copy suggestions using `suggestPromotionCopy()`
2. Pre-fill copy suggestions panel in content studio
3. Allow user to select/edit variant before creating promotion

Example usage:
```typescript
import { suggestPromotionCopy } from '@/api/promoCopy';

const copyResult = await suggestPromotionCopy({
  storeId: effectiveStoreId,
  productId: product.id,
  goal: 'increase_orders',
  channel: 'social_media',
  tone: 'friendly',
  limit: 3,
});

if (copyResult.ok && copyResult.variants.length > 0) {
  // Pre-fill copy in editor
  setHeadline(copyResult.variants[0].headline);
  setBody(copyResult.variants[0].body);
  setCta(copyResult.variants[0].cta);
}
```

## Verification Steps

### 1. Test Endpoint with curl
```bash
curl -X POST http://localhost:3000/api/mi/promo/suggest-copy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "storeId": "your-store-id",
    "productId": "product-id",
    "goal": "increase_orders",
    "channel": "social_media",
    "tone": "friendly",
    "limit": 3
  }'
```

### 2. Test Store Mismatch Prevention
```bash
# Use a productId that belongs to a different store
curl -X POST http://localhost:3000/api/mi/promo/suggest-copy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "storeId": "store-1",
    "productId": "product-from-different-store",
    "goal": "increase_orders",
    "channel": "store_page"
  }'
# Should return error if product doesn't belong to store
```

### 3. Test Different Goals
- `increase_orders`: Should generate "Order Now" CTAs
- `launch_product`: Should generate "New: {product}" headlines
- `clear_inventory`: Should generate "Limited Time" messaging

### 4. Test Channel Adaptation
- `social_media`: Should include hashtags
- `email`: Should have longer body text
- `store_page`: Should include store-specific messaging

### 5. Test Mismatch Detection
- Chinese restaurant + product with "pizza" in description
- Should penalize or avoid Italian food references

## Logging Format

### Promotion Copy Generation
```
[CONTENT_BRAIN][PROMO_COPY] storeId=xxx productId=yyy productName="Kung Pao Chicken" goal=increase_orders channel=social_media tone=friendly variants=3 topScore=85% generationRunId=zzz
```

### Store Mismatch
```
[CONTENT_BRAIN][PROMO_COPY][STORE_MISMATCH] storeId=xxx productId=yyy productStoreId=zzz error=store_mismatch
```

## Next Steps

1. **Frontend Integration**: Add hook to fetch and display copy suggestions when "Create Smart Promotion" is clicked
2. **Content Studio Integration**: Pre-fill copy suggestions panel in editor
3. **Video Generation**: Implement `suggestStoryboard()` and `scoreStoryboard()` functions
4. **A/B Testing**: Track which variants perform best for different goals/channels




