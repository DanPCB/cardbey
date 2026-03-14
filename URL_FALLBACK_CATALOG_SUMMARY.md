# URL Mode Fallback Catalog Fix

## Problem

Website/URL mode could produce empty stores if scraping/parsing returned no products from the website.

## Solution

Added fallback catalog synthesis logic that:
1. Checks if URL extraction produced any products
2. If empty, infers `businessType` from page title/keywords
3. Uses `generateSampleProducts` to create a starter catalog
4. Writes fallback products to database
5. Updates job message to indicate fallback was used
6. Validates that at least one product was created (fails job if both extraction and fallback produce 0 products)

## Changes Made

### 1. URL Job Processor (`miGeneration.ts`)

**Added fallback detection:**
```typescript
// After buildStoreDraftFromUrlMeta:
if (!storeDraft.catalog?.products || storeDraft.catalog.products.length === 0) {
  // Infer businessType from metadata
  // Generate fallback catalog
  // Replace empty catalog with fallback
  useFallbackCatalog = true;
  fallbackMessage = "No menu found on website, created starter catalog based on \"{businessType}\"";
}
```

**Business type inference:**
- Extracts from `title`, `keywords`, and `businessDNA.categoryGuess`
- Simple heuristics:
  - "florist" / "flower" → Florist
  - "restaurant" / "dining" / "eatery" → Restaurant
  - "cafe" / "coffee" → Cafe
  - "bakery" / "baker" → Bakery
  - "pizza" / "pizzeria" → Pizza
  - Falls back to `businessDNA.categoryGuess` or "General"

**Fallback catalog generation:**
- Uses same `generateSampleProducts()` function as form jobs
- Products have lower confidence (0.6 vs 0.8) to indicate they're fallback
- Same product creation logic (writes to database)

**Job message:**
- If fallback used: "No menu found on website, created starter catalog based on \"{businessType}\" (X products)"
- If extraction succeeded: "URL processing completed (X products)"

### 2. Product Creation

**Unified logic:**
- Uses inline `normalizeName` function (same as form jobs)
- Handles existing products (idempotent updates)
- Non-blocking: continues even if individual products fail
- Logs when fallback catalog is used

### 3. Validation

**Empty store prevention:**
- After product creation, checks actual product count in database
- If `productCount === 0`, marks job as `failed` with error code `EMPTY_STORE`
- Prevents empty stores from being marked as "succeeded"
- Works for both extraction and fallback paths

## Files Changed

1. `apps/core/cardbey-core/src/services/miGeneration.ts`
   - Added fallback catalog detection after `buildStoreDraftFromUrlMeta`
   - Added business type inference from metadata
   - Added fallback catalog generation using `generateSampleProducts`
   - Updated job message to indicate fallback usage
   - Unified product creation logic (uses inline `normalizeName`)

## Testing Checklist

1. **URL with no products (fallback):**
   - ✅ Use `https://example-restaurant.com` (or any site with no menu)
   - ✅ Job progresses: queued → running → 85% → 100%
   - ✅ Job message: "No menu found on website, created starter catalog based on \"Restaurant\" (15 products)"
   - ✅ Review page shows ~15 products across categories
   - ✅ Products are saved to database

2. **URL with products (extraction):**
   - ✅ Use a restaurant website with menu
   - ✅ Job message: "URL processing completed (X products)"
   - ✅ Review page shows extracted products

3. **Business type inference:**
   - ✅ Florist website → generates Florist catalog
   - ✅ Cafe website → generates Cafe catalog
   - ✅ Unknown type → generates General catalog

4. **Empty store prevention:**
   - ✅ If both extraction and fallback fail, job status = "failed"
   - ✅ Error message: "No products generated. Store cannot be empty."

5. **No CORS / Login Redirect:**
   - ✅ No CORS errors in console
   - ✅ No forced login redirect during creation
   - ✅ Review page loads without auth

## Acceptance Criteria

✅ Website/URL mode produces non-empty store (extraction OR fallback)  
✅ Fallback message: "No menu found on website, created starter catalog based on \"{businessType}\""  
✅ Job fails if both extraction and fallback produce 0 products  
✅ `https://example-restaurant.com` produces non-empty store with ~15 products  
✅ No CORS, no login redirect


