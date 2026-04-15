# Menu Extraction V2 Implementation Summary

## Overview

This document summarizes the implementation of three related features for menu extraction:
1. **Category Inference** - Automatic category assignment for extracted items
2. **Deduplication Detection** - Detect and handle duplicate items
3. **Menu Extraction V2 Schema** - Future-proof extraction data structure

## Files Created

### Backend

1. **`apps/core/cardbey-core/src/engines/menu/categoryInference.js`**
   - `inferMenuCategoryKey()` - Rules-based category inference
   - `getCategoryDisplayName()` - Get display name for category key
   - `ensureCategoriesForStore()` - Ensure standard categories exist

2. **`apps/core/cardbey-core/src/engines/menu/dedupeDetection.js`**
   - `normalizeItemName()` - Normalize names for matching
   - `detectDuplicates()` - Detect duplicates between extracted and existing items
   - `getExistingMenuItems()` - Fetch existing items from database

3. **`apps/core/cardbey-core/src/engines/menu/types/menuExtractionV2.js`**
   - TypeScript-style JSDoc type definitions
   - `createMenuExtractionV2()` - Factory function to create v2 extraction objects

## Files Modified

### Backend

1. **`apps/core/cardbey-core/src/engines/menu/extractMenu.js`**
   - Added category inference before creating items
   - Imports and uses `categoryInference.js` helpers
   - Automatically infers categories for items missing them

2. **`apps/core/cardbey-core/src/orchestrator/services/menuFromPhotoService.js`**
   - Added category inference integration
   - Ensures categories exist before creating items

## Key Code Changes

### 1. Category Inference (`categoryInference.js`)

**Rules-based inference:**
- `coffee`: espresso, latte, cappuccino, flat white, long black, americano, macchiato, mocha, piccolo, etc.
- `beverages`: tea, chai, hot chocolate, juice, smoothie, soda, water, etc.
- `dessert`: cake, slice, muffin, croissant, cookie, brownie, donut, pastry, etc.
- `food`: sandwich, burger, wrap, salad, pizza, pasta, noodles, etc.

**Confidence scoring:**
- Exact match: +10 points
- Contains keyword: +5 points
- Confidence = min(score / 20, 1.0)
- Only applies category if confidence > 0.3

### 2. Deduplication Detection (`dedupeDetection.js`)

**Matching strategies:**
1. **Exact match** (normalized name): `matchScore = 1.0`, `matchedOn = "name"`
2. **Fuzzy match** (Levenshtein similarity ≥ 0.9): `matchScore = similarity`, `matchedOn = "fuzzy_name"`
3. **No match**: `status = "unique"`

**Dedupe status:**
- `"unique"` - No match found
- `"duplicate"` - Exact match found
- `"possible_duplicate"` - Fuzzy match found

**Recommended actions:**
- Default: `"skip"` (to prevent accidental overwrites)
- User can choose: `"skip"`, `"replace"`, or `"create_new"`

### 3. Integration Points

**In `extractMenu.js`:**
```javascript
// Import category inference helpers
const { ensureCategoriesForStore, inferMenuCategoryKey, getCategoryDisplayName } = 
  await import('./categoryInference.js');

// Ensure categories exist
let categoryMap = {};
if (storeId) {
  categoryMap = await ensureCategoriesForStore(storeId, { db });
}

// Infer categories for items
items: llmResult.items.map((item, index) => {
  let categoryName = item.category;
  
  if (!categoryName || categoryName === 'Uncategorized') {
    const inferred = inferMenuCategoryKey({
      name: item.name,
      description: item.description || '',
    });
    
    if (inferred.confidence > 0.3) {
      categoryName = getCategoryDisplayName(inferred.key);
    } else {
      categoryName = null; // Uncategorized
    }
  }
  
  return { ...item, category: categoryName };
})
```

## Environment Variables

### Debug Logging

- `DEBUG_MENU_CATEGORY=true` - Enable category inference debug logs
- `DEBUG_MENU_DEDUPE=true` - Enable deduplication debug logs

### Feature Flags

- `FEATURE_MENU_CATEGORY_LLM=true` - Enable LLM fallback for category inference (not yet implemented)

## Testing Checklist

### Category Inference Tests

#### Test 1: Coffee Items
```bash
# Expected: All should infer "coffee" category
- Espresso → coffee
- Latte → coffee
- Cappuccino → coffee
- Flat White → coffee
- Long Black → coffee
- Americano → coffee
- Macchiato → coffee
- Mocha → coffee
- Piccolo Latte → coffee
```

#### Test 2: Beverages
```bash
# Expected: All should infer "beverages" category
- Tea → beverages
- Chai → beverages
- Hot Chocolate → beverages
- Juice → beverages
- Smoothie → beverages
```

#### Test 3: Dessert
```bash
# Expected: All should infer "dessert" category
- Cake → dessert
- Muffin → dessert
- Croissant → dessert
- Cookie → dessert
- Brownie → dessert
```

#### Test 4: Unknown Items
```bash
# Expected: Should return "uncategorized"
- Random Item Name → uncategorized (if no matches)
```

### Manual Test Steps

1. **Upload a menu photo** with coffee items (e.g., Latte, Cappuccino, Flat White)
2. **Check backend logs** for:
   ```
   [Menu Category Inference] Category inferred: "Latte" -> "coffee" (confidence: X.XX)
   ```
3. **Verify items are created** with `category: "Coffee"` (not null)
4. **Check Menu Overview** - Coffee category should show count > 0

### Deduplication Tests

#### Test 1: Exact Duplicate
```bash
# Scenario: Extract menu with "Latte" when "Latte" already exists
# Expected:
- dedupe.status = "duplicate"
- dedupe.match.matchScore = 1.0
- dedupe.match.matchedOn = "name"
- dedupe.recommendedAction = "skip"
```

#### Test 2: Fuzzy Duplicate
```bash
# Scenario: Extract "Flat White" when "Flatwhite" exists
# Expected:
- dedupe.status = "possible_duplicate"
- dedupe.match.matchScore >= 0.9
- dedupe.match.matchedOn = "fuzzy_name"
```

#### Test 3: Unique Item
```bash
# Scenario: Extract "New Item" that doesn't exist
# Expected:
- dedupe.status = "unique"
- dedupe.recommendedAction = "create_new"
```

### Integration Test

1. **Upload menu photo** with items that already exist
2. **Check extraction response** - should include `dedupe` information
3. **Verify UI** (when implemented) shows duplicate comparison cards

## Next Steps (Not Yet Implemented)

### Frontend UI Components

1. **Dedupe Review Modal** (`DedupeReviewModal.jsx`)
   - Show duplicate comparison cards
   - Allow per-item action selection
   - Bulk actions for all duplicates
   - Field-level merge options

2. **Category Display Updates**
   - Show inferred categories in extraction preview
   - Display confidence scores (optional)
   - Allow manual category override

### Backend Enhancements

1. **LLM Fallback for Category Inference**
   - When `FEATURE_MENU_CATEGORY_LLM=true`
   - Use LLM if rules confidence < 0.5
   - Cache LLM results for performance

2. **MenuExtractionRun Table** (Optional)
   - Persist extraction runs for audit/debugging
   - Store user decisions
   - Enable re-opening review modal

3. **MenuExtractionItem Table** (Optional)
   - Store individual item extraction data
   - Track dedupe matches
   - Store user decisions per item

## API Response Changes

### Before (Current)
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "name": "Latte",
        "category": null,
        "price": 5.5,
        "currency": "AUD"
      }
    ]
  }
}
```

### After (With Category Inference)
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "name": "Latte",
        "category": "Coffee",  // ← Inferred automatically
        "price": 5.5,
        "currency": "AUD"
      }
    ]
  }
}
```

### V2 Format (Future)
```json
{
  "extractionId": "uuid",
  "items": [
    {
      "tempId": "item-uuid-0",
      "name": "Latte",
      "categoryKey": "coffee",
      "dedupe": {
        "status": "duplicate",
        "match": {
          "existingItemId": "existing-id",
          "matchScore": 1.0
        },
        "recommendedAction": "skip"
      }
    }
  ],
  "summary": {
    "duplicateCount": 1,
    "uniqueCount": 11
  }
}
```

## Debugging

### Enable Debug Logs

Add to backend `.env`:
```bash
DEBUG_MENU_CATEGORY=true
DEBUG_MENU_DEDUPE=true
```

### Example Logs

**Category Inference:**
```
[Menu Category Inference] Category inferred: "Latte" -> "coffee" (confidence: 0.50, matches: latte)
[Menu Category Inference] Category inferred: "Tea" -> "beverages" (confidence: 0.25, matches: tea)
```

**Deduplication:**
```
[Menu Dedupe] Exact duplicate found: "Latte" matches existing "Latte"
[Menu Dedupe] Fuzzy duplicate found: "Flat White" similar to "Flatwhite" (score: 0.95)
[Menu Dedupe] Dedupe detection complete: 2 duplicates found out of 12 items
```

## Performance Considerations

- **Category Inference**: O(n) where n = number of keywords (very fast, < 1ms per item)
- **Deduplication**: O(n*m) where n = extracted items, m = existing items
  - Optimized with Map for exact matches: O(1) lookup
  - Fuzzy matching: O(m) per item (acceptable for < 1000 items)
- **Database Queries**: Single query to fetch existing items (indexed on `businessId`)

## Backward Compatibility

- ✅ Existing menu items unchanged (only new extractions use inference)
- ✅ Categories still work as strings (no schema changes required)
- ✅ Legacy extraction endpoints still work
- ✅ V2 schema is additive (can coexist with v1)

## Known Limitations

1. **Category Rules**: Limited to English keywords (can be extended)
2. **Fuzzy Matching**: Levenshtein distance may be slow for very large menus (> 1000 items)
3. **LLM Fallback**: Not yet implemented (feature-flagged)
4. **Dedupe UI**: Frontend component not yet created
5. **V2 Schema**: Types defined but not fully integrated into all extraction paths

