# Form Menu Synthesis Fix

## Problem

Form creation (`sourceType="form"`) was producing stores with 0 products, resulting in empty review pages.

## Solution

Implemented catalog synthesis step in `processFormJob` that:
1. Generates sample products based on `businessType` using deterministic templates
2. Writes products directly to the database (not just in draft)
3. Validates product count and fails job if empty
4. Updates progress messages to show catalog generation step

## Changes Made

### 1. Product Generation (`generateSampleProducts.ts`)

**Enhanced templates:**
- **Florist**: 15 products across 5 categories (Bouquets, Roses, Gift Bundles, Delivery, Add-ons)
- **Restaurant/Cafe**: 15 products across 5 categories (Appetizers, Main Courses, Desserts, Beverages, Specials)
- **Bakery**: 5 products (existing)
- **Pizza**: 6 products (existing)
- **General**: 4 products (fallback)

### 2. Form Job Processor (`miGeneration.ts`)

**Added catalog synthesis step:**
- Progress 70%: "Generating catalog..." (new step)
- Writes products to database using same logic as `storeDraftRoutes.js`
- Uses inline `normalizeName` function for product deduplication
- Handles existing products (idempotent updates)
- Non-blocking: continues even if individual products fail

**Added validation:**
- After product creation, checks actual product count in database
- If `productCount === 0`, marks job as `failed` with error code `EMPTY_STORE`
- Prevents empty stores from being marked as "succeeded"

**Progress updates:**
- 30%: Building store draft
- 60%: Creating store
- **70%: Generating catalog...** (NEW)
- 85%: Finalizing store draft
- 100%: Form processing completed (X products)

### 3. Product Creation Logic

```typescript
// For each product in catalog:
1. Normalize product name (lowercase, trim, replace non-alphanumeric)
2. Check if product exists (by businessId + normalizedName)
3. If not exists: create new product
4. If exists: update existing product (idempotent)
5. Count successful creations
6. Validate: fail job if count === 0
```

## Files Changed

1. `apps/core/cardbey-core/src/services/miGeneration.ts`
   - Added catalog synthesis step (progress 70%)
   - Added product creation loop
   - Added validation for empty stores
   - Updated progress messages

2. `apps/core/cardbey-core/src/services/generateSampleProducts.ts`
   - Enhanced Florist template (7 → 15 products)
   - Enhanced Restaurant/Cafe template (7 → 15 products)
   - Maintained existing templates (Bakery, Pizza, General)

## Testing Checklist

1. **Form Creation:**
   - ✅ Create store: "Union Road Florist" / "Florist" / "Melbourne"
   - ✅ Job progresses: queued → running → 70% (Generating catalog) → 85% → 100%
   - ✅ Review page shows ~15 products across 5 categories
   - ✅ Products have names, prices, categories, descriptions

2. **Restaurant:**
   - ✅ Create store: "Joe's Diner" / "Restaurant" / "New York"
   - ✅ Review page shows ~15 products across 5 categories

3. **Empty Store Prevention:**
   - ✅ If product creation fails completely, job status = "failed"
   - ✅ Error message: "No products generated. Store cannot be empty."

4. **No CORS / Login Redirect:**
   - ✅ No CORS errors in console
   - ✅ No forced login redirect during creation
   - ✅ Review page loads without auth

## Acceptance Criteria

✅ Form: "Union Road Florist / Florist / Melbourne" → store review shows categories and ~15 products  
✅ No CORS, no login redirect  
✅ Job transitions queued→running→succeeded and redirect happens  
✅ Products are saved to the SAME storeId from the job row  
✅ Progress messages show "Generating catalog..." step


