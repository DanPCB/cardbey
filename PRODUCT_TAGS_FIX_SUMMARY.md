# Product.tags Type Mismatch Fix

## Summary

Fixed Prisma schema mismatch where `Product.tags` expects `String?` but code was writing arrays `string[]`.

## Changes Made

### 1. Created Normalization Helper

**File:** `apps/core/cardbey-core/src/utils/normalizeProductTags.js`

- `normalizeProductTags(input, jobId?, additionalTags?)` → `string|null`
  - Converts arrays, strings, or null to comma-separated string
  - Always appends `orchestra:${jobId}` if provided
  - Supports additional tags (e.g., `['emergency_fallback']`)
  - Returns `null` if empty, otherwise comma-separated string

- `parseProductTags(tagsString)` → `string[]`
  - Parses comma-separated string back to array
  - Supports JSON arrays for backward compatibility

### 2. Updated Orchestra Projection Service

**File:** `apps/core/cardbey-core/src/services/orchestra/orchestraProjectionService.js`

#### Primary Product Upsert (lines ~430-474):
```javascript
// BEFORE:
const existingTags = Array.isArray(item.tags) ? item.tags : [];
const tags = [...new Set([...existingTags, jobTag])];
// ... 
tags: tags, // ❌ Array

// AFTER:
const normalizedTags = normalizeProductTags(item.tags, jobId);
// DEV ASSERTION: Ensure tags is never an array
if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
  if (Array.isArray(normalizedTags)) {
    throw new Error('normalizeProductTags returned array instead of string|null');
  }
}
// ...
tags: normalizedTags, // ✅ String|null
```

#### Emergency Fallback (lines ~620-680):
```javascript
// BEFORE:
tags: [...(product.tags || []), jobTag, 'emergency_fallback'], // ❌ Array

// AFTER:
const normalizedTags = normalizeProductTags(product.tags, jobId, ['emergency_fallback']);
// DEV ASSERTION included
tags: normalizedTags, // ✅ String|null
```

#### Tag Reading (line ~312):
```javascript
// BEFORE:
const tags = Array.isArray(p.tags) ? p.tags : [];

// AFTER:
const tags = parseProductTags(p.tags); // Parse from comma-separated string
```

#### Error Handling (lines ~735-750):
- Enhanced error messages to include specific failure reasons:
  - `tags type mismatch`
  - `schema mismatch`
  - `validation errors`
- Stores compact errors in ActivityEvent to avoid huge logs

### 3. Updated Products Route

**File:** `apps/core/cardbey-core/src/routes/products.js`

#### Product Generate Endpoint (lines ~495-520):
```javascript
// BEFORE:
tags: Array.isArray(productData.tags) ? productData.tags : [],

// AFTER:
tags: normalizeProductTags(productData.tags), // ✅ String|null
```

#### Fail-Safe Default Products (line ~577):
```javascript
// BEFORE:
tags: Array.isArray(defaultProduct.tags) ? defaultProduct.tags : [],

// AFTER:
tags: normalizeProductTags(defaultProduct.tags), // ✅ String|null
```

#### Tag Reading (line ~188):
```javascript
// BEFORE:
const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? JSON.parse(p.tags) : []);

// AFTER:
const tags = parseProductTags(p.tags); // Parse from comma-separated string
```

### 4. Emergency Fallback Improvements

**File:** `apps/core/cardbey-core/src/services/orchestra/orchestraProjectionService.js`

1. **Normalized Name Slugification:**
   ```javascript
   // BEFORE:
   const normalizedName = product.name.toLowerCase().trim();
   
   // AFTER:
   const normalizedName = product.name
     .toLowerCase()
     .trim()
     .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
     .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
     || `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`; // Fallback
   ```

2. **Error Storage:**
   - Stores compact errors in ActivityEvent (max 200 chars)
   - Includes productName, errorMessage, errorType
   - Prevents huge logs

3. **Enhanced Failure Reasons:**
   - Detects `tags type mismatch` errors
   - Detects `schema mismatch` errors
   - Detects `validation errors`
   - Includes in job failure message

## Schema

**Current:** `Product.tags String?` (comma-separated string or null)

**Not Changed:** Keeping `String?` format for now (can be changed to `String[]` later if needed)

## Acceptance Criteria

✅ **No Prisma Validation Errors:**
- `normalizeProductTags` always returns `string|null`, never array
- DEV assertions ensure arrays never reach Prisma
- All Product mutations use normalization

✅ **sync_store Creates Products:**
- Primary upsert path uses normalized tags
- Emergency fallback uses normalized tags
- Fail-safe default products use normalized tags

✅ **Emergency Fallback Works:**
- Uses same normalization as primary path
- Properly slugifies `normalizedName`
- Stores compact errors in ActivityEvent
- Includes clear failure reasons in job error

✅ **No Array Writes:**
- `grep` shows no `tags: [` for Product mutations in Orchestra/projection
- All writes use `normalizeProductTags()`

## Files Modified

1. ✅ `apps/core/cardbey-core/src/utils/normalizeProductTags.js` (NEW)
2. ✅ `apps/core/cardbey-core/src/services/orchestra/orchestraProjectionService.js`
3. ✅ `apps/core/cardbey-core/src/routes/products.js`

## Testing

1. **Test with array input:**
   ```javascript
   normalizeProductTags(['tag1', 'tag2'], 'job123') 
   // → "tag1, tag2, orchestra:job123"
   ```

2. **Test with string input:**
   ```javascript
   normalizeProductTags('tag1, tag2', 'job123')
   // → "tag1, tag2, orchestra:job123"
   ```

3. **Test with null:**
   ```javascript
   normalizeProductTags(null, 'job123')
   // → "orchestra:job123"
   ```

4. **Test emergency fallback:**
   - Create job with empty catalog
   - Verify emergency fallback creates products with normalized tags
   - Verify no Prisma validation errors

## Notes

- Tags are stored as comma-separated strings (readable format)
- `orchestra:${jobId}` tag is always appended when jobId provided
- Emergency fallback products include `emergency_fallback` tag
- Backward compatible: can parse both comma-separated and JSON array formats




